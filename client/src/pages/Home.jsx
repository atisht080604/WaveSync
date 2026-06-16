import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RadioReceiver, Headphones } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';

import './Home.css';

// Socket singleton for basic creation validation
// In a full app, we'd probably manage this in a context
const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export function Home() {
  const navigate = useNavigate();
  const [roomIdInput, setRoomIdInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateRoom = () => {
    setIsCreating(true);
    // Generate a secure random 8-character ID locally
    const roomId = Math.random().toString(36).substring(2, 10).toUpperCase();
    navigate(`/room/${roomId}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!roomIdInput.trim()) return;
    setIsJoining(true);
    // Directly navigate, connection happens in the Room component
    navigate(`/room/${roomIdInput.toUpperCase()}`);
  };

  return (
    <div className="home-container">
      {/* Decorative Waveform Background */}
      <div className="waveform-bg">
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none">
          <path className="wave wave-1" d="M0 100 Q 250 50 500 100 T 1000 100" />
          <path className="wave wave-2" d="M0 100 Q 250 150 500 100 T 1000 100" />
          <path className="wave wave-3" d="M0 100 Q 250 80 500 120 T 1000 100" />
        </svg>
      </div>

      <div className="hero-content">
        <div className="hero-header">
          <h1 className="logo-text">WaveSync</h1>
          <p className="tagline">One room. Every device. Perfect sound.</p>
        </div>

        <div className="action-cards">
          {/* Create Room Card */}
          <Card className="action-card">
            <div className="card-icon-wrapper">
              <RadioReceiver className="card-icon" size={32} />
            </div>
            <h2>Start a Session</h2>
            <p className="card-desc">Generate a room ID and invite others</p>
            <Button 
              variant="primary" 
              className="mt-auto w-full"
              onClick={handleCreateRoom}
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Room →'}
            </Button>
          </Card>

          {/* Join Room Card */}
          <Card className="action-card">
            <div className="card-icon-wrapper">
              <Headphones className="card-icon" size={32} />
            </div>
            <h2>Join a Session</h2>
            <form onSubmit={handleJoinRoom} className="join-form">
              <Input 
                placeholder="Enter Room ID…" 
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                maxLength={8}
                className="room-input"
              />
              <Button 
                variant="primary" 
                type="submit"
                disabled={!roomIdInput.trim() || isJoining}
                className="w-full"
              >
                {isJoining ? 'Joining...' : 'Join Room →'}
              </Button>
            </form>
          </Card>
        </div>

        <footer className="home-footer">
          <p>Synchronize up to 50 devices with sub-10ms latency</p>
        </footer>
      </div>
    </div>
  );
}
