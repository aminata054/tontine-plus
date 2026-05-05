export interface SendOtpResponse {
    success: boolean;
    sessionInfo: string;
    message: string;
}

export interface VerifyOtpResponse {
    success: boolean;
    idToken: string;
    uid: string;
    isNewUser: boolean;
    profileComplete: boolean;
    pinSet: boolean;
    profile?: UserProfile;
    refreshToken: string;
}

export interface SetupPinResponse {
    success: boolean;
    message: string;
}

export interface CompleteProfileResponse {
    success: boolean;
    message: string;
    data: UserProfile;
}

// Le serveur renvoie un customToken — le service se charge de l'échanger
export interface LoginPinResponse {
    success: boolean;
    customToken: string;
    uid: string;
    profile: UserProfile;
}

export interface UserProfile {
    uid: string;
    fullName: string;
    phoneNumber: string;
    photoUrl?: string;
    email?: string;
    reputationScore: number;
    profileComplete: boolean;
    pinSet: boolean;
    referralCode: string;
}

// Réponse de l'Identity Toolkit lors de l'échange customToken idToken
export interface FirebaseSignInResponse {
    idToken: string;
    refreshToken: string;
    expiresIn: string;
    localId: string;
}