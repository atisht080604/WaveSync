const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// ─── DEPLOYMENT: Accept any origin to allow Vercel preview URLs to work seamlessly ───
app.use(cors({
  origin: true,
  methods: ['GET', 'POST'],
  credentials: true
}));

// Ensure uploads dir
if (!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

// Serve static audio files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, crypto.randomUUID() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,   // ─── DEPLOYMENT: accepts all origins (Vercel previews, local, etc) ───
    methods: ['GET', 'POST'],
    credentials: true
  },
  // ─── DEPLOYMENT: keep connections alive on Render ───
  pingTimeout: 60000,
  pingInterval: 25000
});

// HTTP REST route for audio upload
app.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  
  // ─── DEPLOYMENT: Return relative path. Avoids proxy http/https mismatch on Render ───
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// Health check endpoint for keep-alive
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Memory store for rooms
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Measure latency and establish server time offset for client synchronization
  socket.on('ping', (clientTime, callback) => {
     if (typeof callback === 'function') {
        callback(Date.now());
     }
  });

  socket.on('create-room', () => {
    const roomId = crypto.randomUUID().slice(0, 8).toUpperCase();
    rooms.set(roomId, {
      users: [],
      hostId: socket.id,
      currentTrack: null,
      playlist: [],
      playing: false,
      currentTime: 0,
      lastUpdate: Date.now()
    });
    
    socket.emit('room-created', { roomId });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on('join-room', ({ roomId }) => {
    socket.join(roomId);
    socket.roomId = roomId;

    let room = rooms.get(roomId);
    if (!room) {
      room = {
        users: [],
        hostId: socket.id,
        currentTrack: null,
        playlist: [],
        playing: false,
        currentTime: 0,
        lastUpdate: Date.now()
      };
      rooms.set(roomId, room);
      console.log(`Room ${roomId} auto-created by ${socket.id}`);
    }

    const newUser = { id: socket.id, joinedAt: Date.now(), ping: Math.floor(Math.random() * 20) + 5 };
    room.users.push(newUser);

    socket.emit('room-state', {
      users: room.users,
      hostId: room.hostId,
      track: room.currentTrack,
      playlist: room.playlist,
      playing: room.playing
    });

    socket.to(roomId).emit('user-joined', { users: room.users });
    console.log(`${socket.id} joined ${roomId}`);
  });

  socket.on('new-track', (trackMetadata) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;

    room.currentTrack = trackMetadata;
    room.playing = true;
    room.currentTime = 0;
    room.lastUpdate = Date.now();
    
    io.to(socket.roomId).emit('room-state', {
      users: room.users,
      hostId: room.hostId,
      track: room.currentTrack,
      playlist: room.playlist,
      playing: true
    });

    io.to(socket.roomId).emit('sync', {
      serverTime: Date.now(),
      targetTime: 0,
      targetPlaying: true
    });
  });

  socket.on('add-to-playlist', (trackMetadata) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;
    
    room.playlist.push(trackMetadata);
    
    io.to(socket.roomId).emit('room-state', {
      users: room.users,
      hostId: room.hostId,
      track: room.currentTrack,
      playlist: room.playlist,
      playing: room.playing
    });
  });

  socket.on('next-track', () => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;
    
    if (room.playlist.length > 0) {
      room.currentTrack = room.playlist.shift();
      room.currentTime = 0;
      room.playing = true;
      room.lastUpdate = Date.now();
      
      io.to(socket.roomId).emit('room-state', {
        users: room.users,
        hostId: room.hostId,
        track: room.currentTrack,
        playlist: room.playlist,
        playing: true
      });
      
      io.to(socket.roomId).emit('sync', {
        serverTime: Date.now(),
        targetTime: 0,
        targetPlaying: true
      });
    } else {
      room.currentTrack = null;
      room.currentTime = 0;
      room.playing = false;
      
      io.to(socket.roomId).emit('room-state', {
        users: room.users,
        hostId: room.hostId,
        track: null,
        playlist: [],
        playing: false
      });
    }
  });

  socket.on('remove-from-playlist', (index) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;
    
    if (index >= 0 && index < room.playlist.length) {
      room.playlist.splice(index, 1);
      io.to(socket.roomId).emit('room-state', {
        users: room.users,
        hostId: room.hostId,
        track: room.currentTrack,
        playlist: room.playlist,
        playing: room.playing
      });
    }
  });

  socket.on('playback', ({ action, currentTime }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;

    room.playing = action === 'play';
    room.currentTime = currentTime;
    room.lastUpdate = Date.now();

    io.to(socket.roomId).emit('sync', {
      serverTime: Date.now(),
      targetTime: currentTime,
      targetPlaying: room.playing
    });
  });

  socket.on('seek', ({ time }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;

    room.currentTime = time;
    room.lastUpdate = Date.now();

    io.to(socket.roomId).emit('sync', {
      serverTime: Date.now(),
      targetTime: time,
      targetPlaying: room.playing
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.users = room.users.filter(u => u.id !== socket.id);
        
        if (room.hostId === socket.id && room.users.length > 0) {
          room.hostId = room.users[0].id;
        }

        if (room.users.length === 0) {
          rooms.delete(socket.roomId);
        } else {
          io.to(socket.roomId).emit('user-left', { users: room.users });
          io.to(socket.roomId).emit('room-state', {
            users: room.users,
            hostId: room.hostId,
            track: room.currentTrack,
            playlist: room.playlist,
            playing: room.playing
          });
        }
      }
    }
  });
});

// Periodic sync heartbeat (2 seconds) — unchanged
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    if (room.playing && room.currentTrack) {
      const elapsed = (now - room.lastUpdate) / 1000;
      const estimatedTime = room.currentTime + elapsed;
      
      io.to(roomId).emit('sync', {
        serverTime: now,
        targetTime: estimatedTime,
        targetPlaying: true
      });
    }
  });
}, 2000);

// ─── DEPLOYMENT: PORT from Render env, fallback 3001 for local dev ───
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WaveSync Server running on port ${PORT}`);
  
  // ─── DEPLOYMENT: Keep-alive for Render free tier ───
  const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_EXTERNAL_URL) {
    setInterval(() => {
      const url = `${RENDER_EXTERNAL_URL}/health`;
      const client = url.startsWith('https') ? https : http;
      client.get(url).on('error', (err) => {
        console.error('Keep-alive error:', err.message);
      });
      console.log(`Pinged ${url} to keep awake.`);
    }, 14 * 60 * 1000); // 14 minutes
  }
});
