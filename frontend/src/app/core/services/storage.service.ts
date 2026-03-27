import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

@Injectable({ providedIn: 'root' })
export class StorageService {

    private readonly KEYS = {
        ONBOARDING: 'hasSeenOnboarding',
        ID_TOKEN: 'idToken',
        USER: 'user',
        PHONE: 'phoneNumber',
    };

    // ── Onboarding ────────────────────────────────────────────
    async setHasSeenOnboarding(): Promise<void> {
        await Preferences.set({ key: this.KEYS.ONBOARDING, value: 'true' });
    }

    async hasSeenOnboarding(): Promise<boolean> {
        const { value } = await Preferences.get({ key: this.KEYS.ONBOARDING });
        return value === 'true';
    }

    // ── Token ─────────────────────────────────────────────────
    async setToken(token: string): Promise<void> {
        await Preferences.set({ key: this.KEYS.ID_TOKEN, value: token });
    }

    async getToken(): Promise<string | null> {
        const { value } = await Preferences.get({ key: this.KEYS.ID_TOKEN });
        return value;
    }

    // ── Utilisateur ───────────────────────────────────────────
    async setUser(user: any): Promise<void> {
        await Preferences.set({ key: this.KEYS.USER, value: JSON.stringify(user) });
    }

    async getUser(): Promise<any | null> {
        const { value } = await Preferences.get({ key: this.KEYS.USER });
        return value ? JSON.parse(value) : null;
    }

    // ── Numéro de téléphone (nécessaire pour login-pin) ───────
    async setPhoneNumber(phone: string): Promise<void> {
        await Preferences.set({ key: this.KEYS.PHONE, value: phone });
    }

    async getPhoneNumber(): Promise<string | null> {
        const { value } = await Preferences.get({ key: this.KEYS.PHONE });
        return value;
    }

    // ── Nettoyage ─────────────────────────────────────────────
    async clear(): Promise<void> {
        await Promise.all([
            Preferences.remove({ key: this.KEYS.ID_TOKEN }),
            Preferences.remove({ key: this.KEYS.USER }),
            Preferences.remove({ key: this.KEYS.PHONE }),
        ]);
    }
}