import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import path from 'path';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const PORT = 3000;

  // Setup Redis
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  const redisClient = pubClient.duplicate(); // For storing messages

  let useRedis = false;

  try {
    await Promise.all([
      pubClient.connect(),
      subClient.connect(),
      redisClient.connect()
    ]);
    io.adapter(createAdapter(pubClient, subClient));
    useRedis = true;
    console.log('Connected to Redis successfully');
  } catch (error) {
    console.warn('Failed to connect to Redis. Falling back to in-memory storage.', error);
  }

  // In-memory fallback
  const inMemoryMessages: any[] = [];
  const inMemoryUsers = new Map<string, string>();

  async function broadcastActiveUsers() {
    try {
      let users: string[] = [];
      if (useRedis) {
        const activeUsersMap = await redisClient.hGetAll('active_users');
        users = Array.from(new Set(Object.values(activeUsersMap)));
      } else {
        users = Array.from(new Set(inMemoryUsers.values()));
      }
      io.emit('active users', users);
    } catch (error) {
      console.error('Error broadcasting users:', error);
    }
  }

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', redis: useRedis });
  });

  app.get('/api/messages', async (req, res) => {
    try {
      if (useRedis) {
        const messages = await redisClient.lRange('chat_messages', 0, -1);
        res.json(messages.map(m => JSON.parse(m as string)));
      } else {
        res.json(inMemoryMessages);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', async (username: string) => {
      if (useRedis) {
        await redisClient.hSet('active_users', socket.id, username);
      } else {
        inMemoryUsers.set(socket.id, username);
      }
      await broadcastActiveUsers();
    });

    socket.on('chat message', async (msg) => {
      const messageData = {
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        text: msg.text,
        user: msg.user,
        timestamp: new Date().toISOString(),
      };

      if (useRedis) {
        try {
          await redisClient.rPush('chat_messages', JSON.stringify(messageData));
          // Keep only the last 100 messages
          await redisClient.lTrim('chat_messages', -100, -1);
        } catch (error) {
          console.error('Error saving message to Redis:', error);
        }
      } else {
        inMemoryMessages.push(messageData);
        if (inMemoryMessages.length > 100) {
          inMemoryMessages.shift();
        }
      }

      io.emit('chat message', messageData);
    });

    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      if (useRedis) {
        await redisClient.hDel('active_users', socket.id);
      } else {
        inMemoryUsers.delete(socket.id);
      }
      await broadcastActiveUsers();
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
