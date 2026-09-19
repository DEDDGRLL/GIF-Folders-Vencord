/*
 * GIF Folders - data layer
 * Persists folders through Vencord's DataStore (IndexedDB), so they survive restarts.
 * Folders only store GIF *URLs*; Discord's own favourites are never modified.
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { useEffect, useState } from "@webpack/common";

const STORE_KEY = "GifFolders_v1";

export const settings = definePluginSettings({
    sendImmediately: {
        type: OptionType.BOOLEAN,
        description: "Send a GIF right away when you click it in the folder manager (otherwise it is inserted into the message box)",
        default: false
    }
});



export interface GifRef {
    
    url: string;
    
    src?: string;
    width?: number;
    height?: number;
}

export interface GifFolder {
    id: string;
    name: string;
    
    gifs: string[];
    createdAt: number;
}

interface GifMeta {
    src?: string;
    width?: number;
    height?: number;
}

export interface FolderState {
    folders: GifFolder[];
    
    meta: Record<string, GifMeta>;
}



const UserSettingsProtoStore = findStoreLazy("UserSettingsProtoStore");

let state: FolderState = { folders: [], meta: {} };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(l => l());

export const getState = () => state;

export function useFolderState(): FolderState {
    const [snapshot, setSnapshot] = useState(state);
    useEffect(() => {
        const listener = () => setSnapshot(state);
        listeners.add(listener);
        listener(); 
        return () => void listeners.delete(listener);
    }, []);
    return snapshot;
}

export async function loadFolders() {
    try {
        const saved = await DataStore.get<Partial<FolderState>>(STORE_KEY);
        if (saved && Array.isArray(saved.folders)) {
            state = {
                folders: saved.folders
                    .filter(f => f && typeof f.id === "string")
                    .map(f => ({
                        id: f.id,
                        name: String(f.name ?? "Untitled"),
                        gifs: Array.isArray(f.gifs)
                            ? [...new Set(f.gifs.filter(g => typeof g === "string"))]
                            : [],
                        createdAt: typeof f.createdAt === "number" ? f.createdAt : Date.now()
                    })),
                meta: saved.meta && typeof saved.meta === "object" ? saved.meta : {}
            };
            emit();
        }
    } catch (e) {
        console.error("[GifFolders] Failed to load folders", e);
    }
}

function commit(next: FolderState) {
    state = next;
    emit();
    DataStore.set(STORE_KEY, state).catch(e => console.error("[GifFolders] Failed to save folders", e));
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);



const DIRECT_MEDIA_RE = /\.(gif|png|jpe?g|webp|mp4|webm)(?:[?#]|$)/i;


function getFavoriteGifsMap(): Record<string, any> | undefined {
    const s = UserSettingsProtoStore;
    return (
        s?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs ??
        s?.settings?.favoriteGifs?.gifs ??
        s?.getState?.()?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs
    );
}

export function getFavorites(): GifRef[] {
    const gifs = getFavoriteGifsMap();
    if (!gifs) return [];
    return Object.entries<any>(gifs)
        .sort(([, a], [, b]) => (b?.order ?? 0) - (a?.order ?? 0))
        .map(([url, g]) => ({ url, src: g?.src, width: g?.width, height: g?.height }));
}

export function getFavorite(url: string): GifRef | null {
    const g = getFavoriteGifsMap()?.[url];
    return g ? { url, src: g.src, width: g.width, height: g.height } : null;
}


export function resolvePreview(url: string): GifRef {
    const fav = getFavorite(url);
    const meta = state.meta[url];
    return {
        url,
        src: fav?.src ?? meta?.src ?? (DIRECT_MEDIA_RE.test(url) ? url : undefined),
        width: fav?.width ?? meta?.width,
        height: fav?.height ?? meta?.height
    };
}



function withMeta(meta: FolderState["meta"], gif: GifRef): FolderState["meta"] {
    const fav = getFavorite(gif.url);
    const src = gif.src ?? fav?.src ?? meta[gif.url]?.src;
    if (!src) return meta;
    return {
        ...meta,
        [gif.url]: {
            src,
            width: gif.width ?? fav?.width ?? meta[gif.url]?.width,
            height: gif.height ?? fav?.height ?? meta[gif.url]?.height
        }
    };
}

function pruneMeta(folders: GifFolder[], meta: FolderState["meta"]): FolderState["meta"] {
    const used = new Set(folders.flatMap(f => f.gifs));
    return Object.fromEntries(Object.entries(meta).filter(([url]) => used.has(url)));
}


export function createFolder(name: string, gif?: GifRef): string | null {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const folder: GifFolder = {
        id: newId(),
        name: trimmed,
        gifs: gif ? [gif.url] : [],
        createdAt: Date.now()
    };
    commit({
        folders: [...state.folders, folder],
        meta: gif ? withMeta(state.meta, gif) : state.meta
    });
    return folder.id;
}

export function renameFolder(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    commit({
        ...state,
        folders: state.folders.map(f => (f.id === id ? { ...f, name: trimmed } : f))
    });
}


export function deleteFolder(id: string) {
    const folders = state.folders.filter(f => f.id !== id);
    commit({ folders, meta: pruneMeta(folders, state.meta) });
}

export function addGifToFolder(folderId: string, gif: GifRef): boolean {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder || folder.gifs.includes(gif.url)) return false;
    commit({
        folders: state.folders.map(f => (f.id === folderId ? { ...f, gifs: [...f.gifs, gif.url] } : f)),
        meta: withMeta(state.meta, gif)
    });
    return true;
}


export function removeGifFromFolder(folderId: string, url: string) {
    const folders = state.folders.map(f =>
        f.id === folderId ? { ...f, gifs: f.gifs.filter(g => g !== url) } : f
    );
    commit({ folders, meta: pruneMeta(folders, state.meta) });
}

export function toggleGifInFolder(folderId: string, gif: GifRef): "added" | "removed" | null {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return null;
    if (folder.gifs.includes(gif.url)) {
        removeGifFromFolder(folderId, gif.url);
        return "removed";
    }
    addGifToFolder(folderId, gif);
    return "added";
}
