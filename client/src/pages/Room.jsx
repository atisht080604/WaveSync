import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { Crown, Play, Pause, SkipBack, SkipForward, Volume2, UploadCloud, Copy, LogOut, Search, Plus, X } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { cn } from '../lib/utils';
import './Room.css';

const PREDEFINED_TRACKS = [
  { name: 'Electronic Atmosphere', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { name: 'Upbeat Piano', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { name: 'Synthwave Groove', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { name: 'Chill Lofi Beats', artist: 'WaveSync Audio', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { name: 'Deep Space Echoes', artist: 'AstroSound', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
  { name: 'Cyberpunk Pulse', artist: 'NeonGrid', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3' },
  { name: 'Ambient Rain', artist: 'NatureFlow', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { name: 'Midnight Jazz', artist: 'BlueNote', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3' },
];

export function Room() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Room State
  const [users, setUsers] = useState([]);
  const [playlist, setPlaylist] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const isHostRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState('Waiting for host...');
  const [artistName, setArtistName] = useState('—');
  const [syncStatus, setSyncStatus] = useState('connected');

  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const progressFillRef = useRef(null);
  const currentTimeRef = useRef(null);
  const durationRef = useRef(null);

  const [ping, setPing] = useState(0);

  useEffect(() => {
    socket.connect();

    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';

    audioRef.current.addEventListener('ended', () => {
      if (isHostRef.current) {
        socket.emit('next-track');
      }
    });

    // ─── HIGH PRECISION TIME SYNC ───
    let timeOffset = 0;
    
    socket.on('connect', () => {
      setSyncStatus('connected');
      socket.emit('join-room', { roomId: id });
      
      const start = performance.now();
      socket.emit('ping', Date.now(), (serverReceivedTime) => {
        const rtt = performance.now() - start;
        setPing(Math.round(rtt));
        timeOffset = serverReceivedTime - (Date.now() - rtt / 2);
      });
    });

    socket.on('pong', (serverTime) => {
       // Optional continuous clock offset sync
    });

    socket.on('room-state', (state) => {
      setUsers(state.users);
      if (socket.id) {
        setIsHost(state.hostId === socket.id);
        isHostRef.current = (state.hostId === socket.id);
      } else {
        setTimeout(() => {
          setIsHost(state.hostId === socket.id);
          isHostRef.current = (state.hostId === socket.id);
        }, 100);
      }
      
      if (state.track) {
        setTrackName(state.track.name);
        setArtistName(state.track.artist);
        if (audioRef.current.src !== state.track.url) {
          audioRef.current.src = state.track.url;
        }
      } else {
        setTrackName('Waiting for host...');
        setArtistName('—');
        if (audioRef.current.src) audioRef.current.src = '';
      }
      
      if (state.playlist) setPlaylist(state.playlist);
      
      if (state.playing !== undefined) {
        setIsPlaying(state.playing);
        if (!state.playing && audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
        }
      }
    });

    socket.on('user-joined', ({ users }) => setUsers(users));
    socket.on('user-left', ({ users }) => setUsers(users));

    socket.on('sync', ({ serverTime, targetTime, targetPlaying }) => {
      if (!audioRef.current) return;
      
      const estimatedServerNow = Date.now() + timeOffset; 
      const timeSinceEmission = (estimatedServerNow - serverTime) / 1000;
      
      let estimatedTrueTime = targetTime;
      if (targetPlaying) {
         estimatedTrueTime += timeSinceEmission;
      }
      
      const drift = Math.abs(audioRef.current.currentTime - estimatedTrueTime);
      setSyncStatus(drift > 0.15 ? 'drifting' : 'connected');

      if (drift > 0.15 && targetPlaying) {
        audioRef.current.currentTime = estimatedTrueTime;
      }
      
      if (targetPlaying && audioRef.current.paused) {
        const prevVol = audioRef.current.volume;
        if (drift > 0.15) audioRef.current.volume = 0;
        
        audioRef.current.play().then(() => {
           if (drift > 0.15) audioRef.current.volume = prevVol;
        }).catch(e => console.log('Autoplay blocked:', e));
        
        setIsPlaying(true);
      } else if (!targetPlaying && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    });

    socket.on('disconnect', () => setSyncStatus('disconnected'));

    let animationFrame;
    const updateProgress = () => {
      if (audioRef.current && progressFillRef.current && currentTimeRef.current && durationRef.current) {
        const ct = audioRef.current.currentTime || 0;
        const dur = audioRef.current.duration || 0;
        
        progressFillRef.current.style.width = `${dur ? (ct / dur) * 100 : 0}%`;
        
        const formatTimeStr = (seconds) => {
          if (!seconds || isNaN(seconds)) return '0:00';
          const m = Math.floor(seconds / 60);
          const s = Math.floor(seconds % 60);
          return `${m}:${s.toString().padStart(2, '0')}`;
        };

        currentTimeRef.current.textContent = formatTimeStr(ct);
        durationRef.current.textContent = formatTimeStr(dur);
      }
      animationFrame = requestAnimationFrame(updateProgress);
    };
    animationFrame = requestAnimationFrame(updateProgress);

    return () => {
      cancelAnimationFrame(animationFrame);
      socket.off('connect');
      socket.off('pong');
      socket.off('room-state');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('sync');
      socket.off('disconnect');
      socket.disconnect();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [id]);

  // Actions
  const handlePlayPause = () => {
    if (!isHost) return;
    const action = isPlaying ? 'pause' : 'play';
    socket.emit('playback', { 
      action, 
      currentTime: audioRef.current?.currentTime || 0 
    });
  };

  const handleSeek = (e) => {
    if (!isHost || !progressRef.current) return;
    const dur = audioRef.current?.duration || 0;
    if (!dur) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * dur;
    socket.emit('seek', { time: newTime });
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = () => {
    navigate('/');
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (isHost) {
      const origTrackName = trackName;
      setTrackName(files.length > 1 ? `Uploading ${files.length} tracks...` : 'Uploading...');
      
      let serverUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
      serverUrl = serverUrl.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
      
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const formData = new FormData();
          formData.append('audio', file);
          
          const res = await fetch(`${serverUrl}/upload`, {
            method: 'POST',
            body: formData
          });
          
          if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
          
          const data = await res.json();
          
          const finalUrl = data.url.startsWith('http') ? data.url : `${serverUrl}${data.url}`;
          const trackTitle = file.name.replace(/\.[^/.]+$/, "");
          
          socket.emit('add-to-playlist', {
            name: trackTitle,
            artist: 'Local Upload',
            url: finalUrl
          });
        }
        
        setTrackName(origTrackName);
        setUploadModalOpen(false);
      } catch (err) {
        console.error('Failed to upload file(s):', err);
        setTrackName('Upload Failed');
        setTimeout(() => setTrackName(origTrackName), 2000);
      }
      e.target.value = '';
    }
  };

  const handlePredefinedSelect = (track, mode = 'play') => {
    if (!isHost) return;
    
    if (mode === 'play') {
      socket.emit('new-track', {
        name: track.name,
        artist: track.artist,
        url: track.url
      });
    } else {
      socket.emit('add-to-playlist', {
        name: track.name,
        artist: track.artist,
        url: track.url
      });
    }
    
    setUploadModalOpen(false);
  };

  return (
    <div className="room-layout">
      {/* Left Panel: Player */}
      <div className="player-panel">
        <div className="track-info-area">
          <div className={cn("album-art", isPlaying && "playing")}>
            <div className="album-center-hole" />
          </div>
          <h2 className="track-name">{trackName}</h2>
          <p className="artist-name">{artistName}</p>
        </div>

        <div className="visualizer-container">
          <div className={cn("visualizer-bars", isPlaying && "active")}>
            {[...Array(30)].map((_, i) => (
              <div key={i} className="v-bar" style={{ animationDelay: `${Math.random() * 0.5}s` }} />
            ))}
          </div>
        </div>

        <div className="progress-system">
          <div className="time-labels">
            <span ref={currentTimeRef}>0:00</span>
            <span ref={durationRef}>0:00</span>
          </div>
          <div 
            className="progress-track" 
            ref={progressRef}
            onClick={handleSeek}
            style={{ cursor: isHost ? 'pointer' : 'default' }}
          >
            <div 
              className="progress-fill" 
              ref={progressFillRef}
              style={{ width: '0%' }}
            >
              <div className="progress-thumb" />
            </div>
          </div>
        </div>

        <div className="main-controls">
          <button className="ctrl-btn" disabled={!isHost} onClick={() => socket.emit('prev-track')}><SkipBack size={20} /></button>
          
          <button 
            className="play-pause-btn" 
            onClick={handlePlayPause}
            disabled={!isHost}
          >
            {isPlaying ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="ml-1" />}
          </button>
          
          <button className="ctrl-btn" disabled={!isHost} onClick={() => socket.emit('next-track')}><SkipForward size={20} /></button>
        </div>
        
        <div className="volume-control">
          <Volume2 size={18} className="text-muted" />
          <input 
            type="range" 
            className="vol-slider" 
            min="0" max="1" step="0.01" 
            onChange={(e) => { if (audioRef.current) audioRef.current.volume = e.target.value; }}
            defaultValue="1"
          />
        </div>

        <div className="now-playing-badge">
          <div className={cn("live-dot", isPlaying && "pulsing")} />
          <span>LIVE • {users.length} connected</span>
        </div>
      </div>

      {/* Right Panel: Room Info & Devices */}
      <div className="info-panel">
        <Card className="room-header-card">
          <div className="flex justify-between items-start w-full">
            <div>
              <p className="label text-muted mb-1">Room ID</p>
              <h1 className="room-id-display">{id}</h1>
            </div>
            <button className="copy-btn" onClick={copyRoomId}>
              <Copy size={18} />
              {copied && <span className="copy-tooltip">Copied!</span>}
            </button>
          </div>
          
          <div className="host-badge mt-4">
            <Crown size={14} className="text-warning" />
            <span>{isHost ? "You are the host" : "Hosted Session"}</span>
          </div>
        </Card>

        {isHost && (
          <Button 
            className="w-full mb-4" 
            variant="ghost" 
            onClick={() => setUploadModalOpen(true)}
          >
            <UploadCloud size={16} /> Select Track
          </Button>
        )}

        <div className="device-list-container">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display text-lg">Devices</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Sync Status</span>
              <div className={cn("sync-status-indicator", syncStatus)} />
            </div>
          </div>
          
          <div className="device-list">
            {users.map((user, i) => (
              <div key={user.id} className="device-row">
                <div className="device-avatar" style={{ backgroundColor: i % 2 === 0 ? 'var(--accent-2)' : 'var(--accent-primary)'}}>
                  {user.id.substring(0,2).toUpperCase()}
                </div>
                <span className="device-name">Client {user.id.substring(0,4)}</span>
                <Badge>{user.ping || '<10'}ms</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Queue Container */}
        <div className="queue-container">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display text-lg">Up Next</h3>
            <Badge>{playlist.length} track{playlist.length !== 1 ? 's' : ''}</Badge>
          </div>
          <div className="queue-list">
            {playlist.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">Queue is empty</p>
            ) : (
              playlist.map((track, i) => (
                <div key={i} className="queue-item">
                  <div className="truncate pr-2 flex-1">
                    <p className="track-title">{track.name}</p>
                    <p className="track-artist">{track.artist}</p>
                  </div>
                  {isHost && (
                    <div className="flex items-center gap-1">
                      <button 
                        className="action-btn-play"
                        title="Play Now"
                        onClick={() => {
                          socket.emit('new-track', track);
                        }}
                      >
                        <Play size={14} fill="currentColor" />
                      </button>
                      <button 
                        className="action-btn-remove"
                        title="Remove from Queue"
                        onClick={() => socket.emit('remove-from-playlist', i)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <Button variant="danger" className="mt-auto w-full" onClick={leaveRoom}>
          <LogOut size={16} /> Leave Room
        </Button>
      </div>

      {/* Upload Modal (Host Only) */}
      {uploadModalOpen && isHost && (
        <div className="upload-modal-overlay">
          <Card className="upload-modal">
            <h2 className="modal-title">Select Track</h2>
            
            <div className="search-bar-container mb-4">
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search tracks or artists..." 
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="overflow-y-auto mb-4 flex-1">
              <h3 className="modal-section-title">Predefined Library</h3>
              <div className="track-list">
                {PREDEFINED_TRACKS.filter(t => 
                  t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  t.artist.toLowerCase().includes(searchTerm.toLowerCase())
                ).map((track, i) => (
                  <div 
                    key={i}
                    className="track-list-btn-container"
                  >
                    <div className="track-info-btn" onClick={() => handlePredefinedSelect(track, 'play')}>
                      <div className="track-placeholder-art">
                        <Play size={10} fill="currentColor" />
                      </div>
                      <div className="text-left truncate">
                        <p className="library-track-name">{track.name}</p>
                        <p className="library-track-artist">{track.artist}</p>
                      </div>
                    </div>
                    
                    <div className="track-actions flex items-center gap-1">
                      <button 
                        className="library-play-btn"
                        onClick={() => handlePredefinedSelect(track, 'play')}
                        title="Play Now"
                      >
                        <Play size={14} fill="currentColor" />
                      </button>
                      <button 
                        className="library-queue-btn"
                        onClick={() => handlePredefinedSelect(track, 'queue')}
                        title="Add to Queue"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {PREDEFINED_TRACKS.filter(t => 
                  t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  t.artist.toLowerCase().includes(searchTerm.toLowerCase())
                ).length === 0 && (
                  <p className="text-sm text-muted text-center py-4">No results found for "{searchTerm}"</p>
                )}
              </div>

              <h3 className="modal-section-title">Upload Local Files</h3>
              <div className="upload-zone py-6">
                <UploadCloud size={28} className="text-muted mb-3 opacity-50" />
                <div className="flex gap-3 justify-center">
                  <label className="browse-btn">
                    <Plus size={14} /> Add Tracks to Queue
                    <input type="file" accept="audio/*" multiple className="file-input-hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>
            </div>
            
            <Button variant="ghost" className="w-full mt-2" onClick={() => {
              setUploadModalOpen(false);
              setSearchTerm('');
            }}>Close Menu</Button>
          </Card>
        </div>
      )}
    </div>
  );
}
