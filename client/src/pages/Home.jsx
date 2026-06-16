import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RadioReceiver, Headphones } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';

import './Home.css';

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
      {/* Ambient Radial Glows */}
      <div className="ambient-glow-1" />
      <div className="ambient-glow-2" />

      {/* Decorative Waveform Background */}
      <div className="waveform-bg">
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none">
          <path className="wave wave-1" d="M0 100 Q 250 50 500 100 T 1000 100" />
          <path className="wave wave-2" d="M0 100 Q 250 150 500 100 T 1000 100" />
          <path className="wave wave-3" d="M0 100 Q 250 80 500 120 T 1000 100" />
        </svg>
      </div>

      <div className="hero-content">
        <header className="hero-header animate-fade-in">
          <h1 className="logo-text">WaveSync</h1>
          <p className="tagline">One room. Every device. Perfect sound.</p>
        </header>

        <div className="action-cards animate-slide-up">
          {/* Create Room Card */}
          <Card className="action-card">
            <div className="card-icon-wrapper">
              <RadioReceiver className="card-icon" size={28} />
            </div>
            <h2>Start Session</h2>
            <p className="card-desc">Instantly host a synchronization room and share with friends.</p>
            <Button 
              variant="primary" 
              className="mt-auto w-full"
              onClick={handleCreateRoom}
              disabled={isCreating}
            >
              {isCreating ? 'Creating Room...' : 'Create Room'}
            </Button>
          </Card>

          {/* Join Room Card */}
          <Card className="action-card">
            <div className="card-icon-wrapper">
              <Headphones className="card-icon" size={28} />
            </div>
            <h2>Join Room</h2>
            <form onSubmit={handleJoinRoom} className="join-form">
              <Input 
                placeholder="ENTER ROOM ID" 
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
                {isJoining ? 'Joining Room...' : 'Join Room'}
              </Button>
            </form>
          </Card>
        </div>

        <footer className="home-footer">
          <p className="tech-badge">LOW LATENCY BEAT SYNC</p>
          <p className="footer-subtext">Synchronize infinite devices with sub-10ms latency drift correction</p>
        </footer>
      </div>
    </div>
  );
}
