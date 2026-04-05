/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
  id: string;
  text: string;
  user: string;
  timestamp: string;
}

export default function App() {
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isJoined) {
      // Connect to Socket.IO server
      const newSocket = io();
      setSocket(newSocket);

      // Fetch initial messages
      fetch('/api/messages')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setMessages(data);
          }
        })
        .catch((err) => console.error('Failed to fetch messages:', err));

      // Listen for new messages
      newSocket.on('chat message', (msg: Message) => {
        setMessages((prev) => [...prev, msg]);
      });

      // Emit join event and listen for active users
      newSocket.emit('join', username);
      newSocket.on('active users', (users: string[]) => {
        setActiveUsers(users);
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [isJoined]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsJoined(true);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && socket) {
      socket.emit('chat message', {
        text: inputValue.trim(),
        user: username,
      });
      setInputValue('');
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  if (!isJoined) {
    return (
      <div className="join-container">
        <div className="join-card">
          <h1 className="join-title">Welcome to Chat</h1>
          <form onSubmit={handleJoin}>
            <input
              type="text"
              className="join-input"
              placeholder="Enter your username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
            <button type="submit" className="join-btn" disabled={!username.trim()}>
              Join Chat
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-layout">
      <div className="chat-sidebar">
        <div className="sidebar-header">
          <h3>Online Users ({activeUsers.length})</h3>
        </div>
        <ul className="user-list">
          {activeUsers.map((user, idx) => (
            <li key={idx} className="user-item">
              <span className="user-status-dot"></span>
              <span className="user-name">{user} {user === username ? '(You)' : ''}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="chat-container">
        <div className="chat-header">
          Chat Room
        </div>
      
      <div className="chat-messages">
        {messages.map((msg) => {
          const isSelf = msg.user === username;
          return (
            <div key={msg.id} className={`message ${isSelf ? 'message-self' : 'message-other'}`}>
              {!isSelf && <div className="message-user">{msg.user}</div>}
              <div>{msg.text}</div>
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-container" onSubmit={handleSendMessage}>
        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          autoFocus
        />
        <button 
          type="submit" 
          className="chat-send-btn"
          disabled={!inputValue.trim()}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>
      </div>
    </div>
  );
}
