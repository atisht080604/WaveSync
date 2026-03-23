import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket'; // ← CHANGED: was `import io from 'socket.io-client'`
import { Crown, Play, Pause, SkipBack, SkipForward, Volume2, UploadCloud, Copy, LogOut, Search, Plus, X } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { cn } from '../lib/utils';
import './Room.css';

// ← REMOVED: const SOCKET_SERVER_URL = ... (now lives in socket.js)

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
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [syncStatus, setSyncStatus] = useState('connected');

  const audioRef = useRef(null);
  const progressRef = useRef(null);

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
    // We calculate the offset between the server's clock and our local performance.now()
    let timeOffset = 0;
    
    socket.on('connect', () => {
      setSyncStatus('connected');
      socket.emit('join-room', { roomId: id });
      
      // Measure initial latency and clock offset
      const start = performance.now();
      socket.emit('ping', Date.now(), (serverReceivedTime) => {
        const rtt = performance.now() - start;
        setPing(Math.round(rtt));
        // Calculate offset: serverTime - (localStartTime + rtt/2)
        timeOffset = serverReceivedTime - (Date.now() - rtt / 2);
      });
    });

    // Handle periodic ping updates from server to maintain clock offset accuracy
    socket.on('pong', (serverTime) => {
       // Optional: continuously refine timeOffset here if needed for long sessions
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
      
      // Calculate true server time adjusting for our measured clock offset
      const estimatedServerNow = Date.now() + timeOffset; 
      
      // How much time has passed on the server since this sync pulse was emitted?
      const timeSinceEmission = (estimatedServerNow - serverTime) / 1000;
      
      // The exact time the track should be at right NOW
      let estimatedTrueTime = targetTime;
      if (targetPlaying) {
         estimatedTrueTime += timeSinceEmission;
      }
      
      const drift = Math.abs(audioRef.current.currentTime - estimatedTrueTime);
      setSyncStatus(drift > 0.15 ? 'drifting' : 'connected');

      // Hard correct if drift exceeds human perception bounds (150ms)
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
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
        setDuration(audioRef.current.duration || 0);
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
    if (!isHost || !progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
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

  const handleFileUpload = async (e, mode = 'play') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isHost) {
      const origTrackName = trackName;
      setTrackName('Uploading...');
      
      const formData = new FormData();
      formData.append('audio', file);
      
      try {
        let serverUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
        serverUrl = serverUrl.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
        
        const res = await fetch(`${serverUrl}/upload`, {
          method: 'POST',
          body: formData
        });
        
        if (!res.ok) throw new Error('Upload failed');
        
        const data = await res.json();
        
        const finalUrl = data.url.startsWith('http') ? data.url : `${serverUrl}${data.url}`;
        const trackTitle = file.name.replace(/\.[^/.]+$/, "");
        
        if (mode === 'play') {
          socket.emit('new-track', {
            name: trackTitle,
            artist: 'Local Upload',
            url: finalUrl
          });
        } else {
          socket.emit('add-to-playlist', {
            name: trackTitle,
            artist: 'Local Upload',
            url: finalUrl
          });
          setTrackName(origTrackName);
        }
        
        setUploadModalOpen(false);
      } catch (err) {
        console.error('Failed to upload file:', err);
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

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
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
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div 
            className="progress-track" 
            ref={progressRef}
            onClick={handleSeek}
            style={{ cursor: isHost ? 'pointer' : 'default' }}
          >
            <div 
              className="progress-fill" 
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            >
              <div className="progress-thumb" />
            </div>
          </div>
        </div>

        <div className="main-controls">
          <button className="ctrl-btn secondary" disabled={!isHost}><SkipBack size={24} /></button>
          
          <button 
            className="play-pause-btn" 
            onClick={handlePlayPause}
            disabled={!isHost}
          >
            {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
          </button>
          
          <button className="ctrl-btn secondary" disabled={!isHost} onClick={() => socket.emit('next-track')}><SkipForward size={24} /></button>
        </div>
        
        <div className="volume-control mt-8">
          <Volume2 size={20} className="text-[var(--text-secondary)]" />
          <input 
            type="range" 
            className="vol-slider" 
            min="0" max="1" step="0.01" 
            onChange={(e) => { if (audioRef.current) audioRef.current.volume = e.target.value; }}
            defaultValue="1"
          />
        </div>

        <div className="now-playing-badge mt-auto">
          <div className={cn("live-dot", isPlaying && "pulsing")} />
          <span>LIVE • {users.length} devices connected</span>
        </div>
      </div>

      {/* Right Panel: Room Info & Devices */}
      <div className="info-panel">
        <Card className="room-header-card">
          <div className="flex justify-between items-start w-full">
            <div>
              <p className="label text-[var(--text-secondary)] mb-1">Room ID</p>
              <h1 className="room-id-display">{id}</h1>
            </div>
            <button className="copy-btn" onClick={copyRoomId}>
              <Copy size={20} />
              {copied && <span className="copy-tooltip">Copied!</span>}
            </button>
          </div>
          
          <div className="host-badge mt-4">
            <Crown size={16} className="text-yellow-400" />
            <span>{isHost ? "You are the host" : "Hosted Session"}</span>
          </div>
        </Card>

        {isHost && (
          <Button 
            className="w-full mb-4" 
            variant="ghost" 
            onClick={() => setUploadModalOpen(true)}
          >
            <UploadCloud size={18} /> Upload Track
          </Button>
        )}

        <div className="device-list-container">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display text-lg">Connected Devices</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">Sync Status</span>
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

        {/* Playlist / Queue */}
        <div className="queue-container mt-6 flex-1 max-h-[200px] flex flex-col mb-4">
          <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h3 className="font-display text-lg">Up Next</h3>
            <Badge>{playlist.length} track{playlist.length !== 1 ? 's' : ''}</Badge>
          </div>
          <div className="queue-list flex flex-col gap-2 overflow-y-auto pr-1">
            {playlist.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] text-center py-4">Queue is empty</p>
            ) : (
              playlist.map((track, i) => (
                <div key={i} className="queue-item flex justify-between items-center bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-subtle)] hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                  <div className="truncate pr-2 overflow-hidden flex-1">
                    <p className="text-sm font-medium truncate text-white" style={{color: 'white'}}>{track.name}</p>
                    <p className="text-xs truncate" style={{color: 'var(--text-secondary)'}}>{track.artist}</p>
                  </div>
                  {isHost && (
                    <button className="text-[var(--text-secondary)] hover:text-[#ff4e4e] transition-colors flex-shrink-0 p-1 rounded-full hover:bg-[rgba(255,78,78,0.1)]" style={{color: 'var(--text-secondary)'}} onClick={() => socket.emit('remove-from-playlist', i)}>
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <Button variant="danger" className="mt-auto w-full flex-shrink-0" onClick={leaveRoom}>
          <LogOut size={18} /> Leave Room
        </Button>
      </div>

      {/* Upload Modal (Host Only) */}
      {uploadModalOpen && isHost && (
        <div className="upload-modal-overlay">
          <Card className="upload-modal overflow-hidden max-h-[85vh] flex flex-col">
            <h2 className="text-2xl font-display mb-2">Select Track</h2>
            
            <div className="search-bar-container mb-4">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search tracks or artists..." 
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="overflow-y-auto mb-4 flex-1 pr-1">
              <h3 className="text-xs text-[var(--text-secondary)] mb-3 uppercase tracking-widest font-semibold">Library</h3>
              <div className="flex flex-col gap-1 mb-6">
                {PREDEFINED_TRACKS.filter(t => 
                  t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  t.artist.toLowerCase().includes(searchTerm.toLowerCase())
                ).map((track, i) => (
                  <div 
                    key={i}
                    className="track-list-btn-container"
                  >
                    <div className="flex items-center gap-3 flex-1 overflow-hidden" onClick={() => handlePredefinedSelect(track, 'play')}>
                      <div className="track-placeholder-art">
                        <Play size={12} fill="currentColor" />
                      </div>
                      <div className="text-left truncate">
                        <p className="font-medium text-white text-sm truncate">{track.name}</p>
                        <p className="text-xs text-[var(--text-secondary)] truncate">{track.artist}</p>
                      </div>
                    </div>
                    
                    <div className="track-actions flex items-center gap-1">
                      <button 
                        className="library-action-btn flex items-center justify-center p-2 rounded-full hover:bg-[rgba(255,255,255,0.1)] transition-colors text-[var(--text-secondary)] hover:text-white"
                        onClick={() => handlePredefinedSelect(track, 'play')}
                        title="Play Now"
                      >
                        <Play size={16} fill="currentColor" />
                      </button>
                      <button 
                        className="library-action-btn queue flex items-center justify-center p-2 rounded-full hover:bg-[var(--accent-primary)] hover:text-[var(--bg-base)] transition-colors text-[var(--text-secondary)]"
                        onClick={() => handlePredefinedSelect(track, 'queue')}
                        title="Add to Queue"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {PREDEFINED_TRACKS.filter(t => 
                  t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  t.artist.toLowerCase().includes(searchTerm.toLowerCase())
                ).length === 0 && (
                  <p className="text-sm text-[var(--text-secondary)] text-center py-4">No results found for "{searchTerm}"</p>
                )}
              </div>

              <h3 className="text-xs text-[var(--text-secondary)] mb-3 uppercase tracking-widest font-semibold">Upload from Computer</h3>
              <div className="upload-zone py-6">
                <UploadCloud size={32} className="text-[var(--text-secondary)] mb-3 opacity-50" />
                <div className="flex gap-3 justify-center mt-4">
                  <label className="browse-btn text-xs px-5 py-2 cursor-pointer flex items-center gap-2 bg-[var(--accent-primary)] text-[var(--bg-base)]">
                    <Play size={14} fill="currentColor" /> Browse
                    <input type="file" accept="audio/*" className="file-input-hidden" onChange={(e) => handleFileUpload(e, 'play')} />
                  </label>
                  <label className="browse-btn text-xs px-5 py-2 cursor-pointer flex items-center gap-2 bg-[var(--bg-elevated)] text-white hover:bg-[var(--bg-surface)]">
                    <Plus size={16} /> Add to Queue
                    <input type="file" accept="audio/*" className="file-input-hidden" onChange={(e) => handleFileUpload(e, 'queue')} />
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
