import 'dotenv/config';

const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

export async function uploadImgbb(imgBase64: string): Promise<string> {
    const form = new FormData();
    form.append('image', imgBase64);

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}&expiration=600`, {
        method: 'POST',
        body: form,
    });

    if (!res.ok) {
        throw new Error(`Failed to upload image: ${res.status}`);
    }
    const data = await res.json();

    return data.data.display_url;
}