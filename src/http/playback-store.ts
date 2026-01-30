export type Track = {
    id: string;
    title: string;
    artists: string[];
    album?: string | null;
    duration_ms: number;
};

export type Device = {
    id?: string;
    name?: string;
    volume_percent?: number;
};

export type PlaybackState = {
    source: "spotify";
    timestamp: string; // ISO
    is_playing: boolean;
    progress_ms?: number | null;
    track?: Track | null;
    device?: Device | null;
    repeat_state?: "track" | "context" | "off" | null;
    shuffle_state?: boolean | null;
};

let state: PlaybackState = {
    source: "spotify",
    timestamp: new Date().toISOString(),
    is_playing: false,
    progress_ms: null,
    track: null,
    device: null,
    repeat_state: null,
    shuffle_state: null
};

export function getPlayback(): PlaybackState {
    return state;
}

export function setPlayback(next: Partial<PlaybackState>): void {
    state = {
        ...state,
        ...next,
        timestamp: new Date().toISOString()
    };
}
