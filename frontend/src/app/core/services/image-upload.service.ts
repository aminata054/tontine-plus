import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ImageUploadService {

    /**
     * Compresse et convertit une image en base64.
     * Pas de Firebase Storage — retourne directement la string base64.
     */
    compressAndConvert(file: Blob, maxSizeKb = 200): Observable<string> {
        return from(this.compress(file, maxSizeKb));
    }

    private async compress(file: Blob, maxSizeKb: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);

                const canvas = document.createElement('canvas');
                const MAX_DIM = 400; // px max (largeur ou hauteur)

                let w = img.width;
                let h = img.height;

                // Redimensionner si trop grande
                if (w > MAX_DIM || h > MAX_DIM) {
                    if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
                    else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
                }

                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

                // Réduire la qualité jusqu'à atteindre maxSizeKb
                let quality = 0.8;
                let base64 = canvas.toDataURL('image/jpeg', quality);

                while (base64.length > maxSizeKb * 1024 * 1.37 && quality > 0.2) {
                    quality -= 0.1;
                    base64 = canvas.toDataURL('image/jpeg', quality);
                }

                resolve(base64);
            };
            img.onerror = reject;
            img.src = url;
        });
    }
}