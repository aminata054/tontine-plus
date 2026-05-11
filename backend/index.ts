import 'dotenv/config';
import './config/firebase';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import authRoutes from './routes/auth.route';
import tontineRoutes from './routes/tontines.route';
import notificationRoutes from './routes/notification.route';
import subscriptionRoutes from './routes/subscription.route';
import chatRoutes from './routes/chat.route';
import paymentRoutes from './routes/payment.route';
import distributionRoutes from './routes/distribution.route';
import voteRoutes from './routes/vote.route';

export const app = express();

const allowedOrigins = [
    'http://localhost:8100',
    'http://localhost:4200',
    'http://localhost:8000',
    'https://us-central1-tontine-plus-dc217.cloudfunctions.net',
];

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        credentials: true,
    })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tontines', tontineRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/tontines/:id/chat', chatRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/distributions', distributionRoutes);
app.use('/api/tontines/:id/votes', voteRoutes);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Serveur: http://localhost:${PORT}`);
    console.log(`Swagger: http://localhost:${PORT}/api-docs`);
});

