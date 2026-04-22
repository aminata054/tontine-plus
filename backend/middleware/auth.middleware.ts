import * as admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';

export const verifyToken = async (
    req: Request, res: Response, next: NextFunction
): Promise<void> => {                                    
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
        res.status(401).json({ error: 'Token manquant' }); 
        return;                                             
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        (req as any).user = { uid: decoded.uid };
        next();
    } catch {
        res.status(401).json({ error: 'Token invalide' });
    }
};