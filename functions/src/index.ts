import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { app } from '../../backend/index';

// Config globale v2
setGlobalOptions({
    maxInstances: 10,
    region: "us-central1"  
});

export const api = onRequest(app);