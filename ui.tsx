/*
 * GIF Folders - UI
 */

import { insertTextIntoChatInputBox, sendMessage } from "@utils/discord";
import {
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalProps,
    ModalRoot,
    ModalSize,
    openModal
} from "@utils/modal";
import {
    Alerts,
    Button,
    ContextMenuApi,
    Menu,
    SelectedChannelStore,
    Text,
    TextInput,
    Toasts,
    useEffect,
    useMemo,
    useRef,
    useState
} from "@webpack/common";

import {
    createFolder,
    deleteFolder,
    getFavorites,
    getState,
    GifRef,
    removeGifFromFolder,
    renameFolder,
    resolvePreview,
    settings,
    toggleGifInFolder,
    useFolderState
} from "./store";

const toast = (message: string, type = Toasts.Type.SUCCESS) =>
    Toasts.show({ message, type, id: Toasts.genId() });

const isVideo = (src: string) => /\.(mp4|webm)(?:[?#]|$)/i.test(src);



interface PromptOptions {
    title: string;
    submitLabel: string;
    initial?: string;
    onSubmit(name: string): void;
}

function FolderNameModal({ modalProps, title, submitLabel, initial = "", onSubmit }: PromptOptions & { modalProps: ModalProps; }) {
    const [name, setName] = useState(initial);
    const valid = name.trim().length > 0;

    const submit = () => {
        if (!valid) return;
        onSubmit(name.trim());
        modalProps.onClose();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>{title}</Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <div
                    style={{ padding: "16px 0" }}
                    onKeyDown={e => { if (e.key === "Enter") submit(); }}
                >
                    <TextInput
                        value={name}
                        onChange={setName}
                        placeholder="Folder name (anything you like)"
                        autoFocus
                    />
                </div>
            </ModalContent>
            <ModalFooter>
                <Button onClick={submit} disabled={!valid}>{submitLabel}</Button>
                <Button
                    color={Button.Colors.TRANSPARENT}
                    look={Button.Looks.LINK}
                    onClick={modalProps.onClose}
                    style={{ marginRight: 8 }}
                >
                    Cancel
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

export function promptFolderName(opts: PromptOptions) {
    openModal(p => <FolderNameModal modalProps={p} {...opts} />);
}




 
export function buildFolderMenuItems(gif: GifRef, idPrefix = "vc-gif-folders") {
    const { folders } = getState();

    const items = folders.map(folder => {
        const has = folder.gifs.includes(gif.url);
        return (
            <Menu.MenuItem
                key={folder.id}
                id={`${idPrefix}-toggle-${folder.id}`}
                label={`${has ? "✓  " : ""}${folder.name}`}
                action={() => {
                    const result = toggleGifInFolder(folder.id, gif);
                    if (result === "added") toast(`Added to “${folder.name}”`);
                    else if (result === "removed") toast(`Removed from “${folder.name}”`);
                }}
            />
        );
    });

    if (items.length) items.push(<Menu.MenuSeparator key="sep" />);

    items.push(
        <Menu.MenuItem
            key="new"
            id={`${idPrefix}-new`}
            label="Create new folder…"
            action={() =>
                promptFolderName({
                    title: "New GIF folder",
                    submitLabel: "Create & add GIF",
                    onSubmit: name => {
                        if (createFolder(name, gif)) toast(`Created “${name}” and added the GIF`);
                    }
                })
            }
        />
    );

    return items;
}



const chipStyle = (active: boolean): React.CSSProperties => ({
    flexShrink: 0,
    padding: "6px 12px",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    color: active ? "#fff" : "var(--text-normal)",
    background: active ? "var(--brand-500, #5865f2)" : "var(--background-modifier-hover, rgba(128,128,128,.2))"
});

const overlayBtn: React.CSSProperties = {
    border: "none",
    cursor: "pointer",
    borderRadius: 12,
    padding: "3px 8px",
    fontSize: 12,
    color: "#fff",
    background: "rgba(0,0,0,.65)"
};

const mediaStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };


function useInView(ref: React.RefObject<HTMLElement>) {
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => setInView(entry.isIntersecting),
            { rootMargin: "300px" }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return inView;
}


function StillImage({ src }: { src: string; }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            const canvas = canvasRef.current;
            if (cancelled || !canvas || !img.naturalWidth) return;
            canvas.width = 320;
            canvas.height = Math.max(1, Math.round(320 * img.naturalHeight / img.naturalWidth));
            canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
            img.onload = null;
            img.src = "";
        };
        img.src = src;
        return () => {
            cancelled = true;
            img.onload = null;
            img.src = "";
        };
    }, [src]);
    return <canvas ref={canvasRef} style={mediaStyle} />;
}

function GifTile({ gif, folderCount, inFolder, onPick, onRemove }: {
    gif: GifRef;
    folderCount: number;
    inFolder: boolean;
    onPick(): void;
    onRemove(): void;
}) {
    const openMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu
                navId="vc-gif-folders-tile-menu"
                onClose={ContextMenuApi.closeContextMenu}
                aria-label="GIF folders"
            >
                {buildFolderMenuItems(gif, "vc-gif-folders-tile")}
            </Menu.Menu>
        ));
    };

    const ref = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const visible = useInView(ref);
    const [hovered, setHovered] = useState(false);
    const media = mediaStyle;

    return (
        <div
            ref={ref}
            onClick={onPick}
            onMouseEnter={() => {
                setHovered(true);
                videoRef.current?.play().catch(() => { });
            }}
            onMouseLeave={() => {
                setHovered(false);
                const v = videoRef.current;
                if (v) {
                    v.pause();
                    v.currentTime = 0;
                }
            }}
            title={gif.url}
            style={{
                position: "relative",
                height: 110,
                borderRadius: 8,
                overflow: "hidden",
                cursor: "pointer",
                background: "var(--background-secondary, #2b2d31)"
            }}
        >
            {gif.src ? (
                !visible ? null : isVideo(gif.src)
                    ? <video ref={videoRef} src={gif.src + "#t=0.001"} preload="metadata" muted loop playsInline style={media} />
                    : hovered
                        ? <img src={gif.src} alt="" style={media} />
                        : <StillImage src={gif.src} />
            ) : (
                <div style={{ padding: 8, fontSize: 11, color: "var(--text-muted)", wordBreak: "break-all" }}>
                    {gif.url}
                </div>
            )}

            <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
                <button style={overlayBtn} onClick={openMenu} title="Add to / remove from folders">
                    Folders ▾
                </button>
                {inFolder && (
                    <button
                        style={overlayBtn}
                        title="Remove from this folder (keeps your Discord favourite)"
                        onClick={e => { e.stopPropagation(); onRemove(); }}
                    >
                        ✕
                    </button>
                )}
            </div>

            {!inFolder && folderCount > 0 && (
                <div style={{ ...overlayBtn, position: "absolute", left: 6, bottom: 6, cursor: "default" }}>
                    In {folderCount} folder{folderCount === 1 ? "" : "s"}
                </div>
            )}
        </div>
    );
}

function GifFoldersModal({ modalProps }: { modalProps: ModalProps; }) {
    const { folders } = useFolderState();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const folder = folders.find(f => f.id === selectedId) ?? null;
    const favorites = useMemo(() => getFavorites(), []);
    const gifs: GifRef[] = folder ? folder.gifs.map(resolvePreview) : favorites;

    const pick = (gif: GifRef) => {
        modalProps.onClose();
        const channelId = SelectedChannelStore.getChannelId();
        if (settings.store.sendImmediately && channelId) {
            sendMessage(channelId, { content: gif.url });
        } else {
            insertTextIntoChatInputBox(gif.url + " ");
        }
    };

    const confirmDelete = () => {
        if (!folder) return;
        Alerts.show({
            title: "Delete folder?",
            body: `“${folder.name}” will be deleted. The GIFs stay in your Discord favourites.`,
            confirmText: "Delete",
            cancelText: "Cancel",
            confirmColor: Button.Colors.RED,
            onConfirm: () => {
                deleteFolder(folder.id);
                setSelectedId(null);
            }
        });
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE}>
            <ModalHeader>
                <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>GIF Folders</Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>

            <ModalContent>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "16px 0 8px" }}>
                    <button style={chipStyle(!folder)} onClick={() => setSelectedId(null)}>
                        All favourites ({favorites.length})
                    </button>
                    {folders.map(f => (
                        <button key={f.id} style={chipStyle(f.id === folder?.id)} onClick={() => setSelectedId(f.id)}>
                            {f.name} ({f.gifs.length})
                        </button>
                    ))}
                    <Button
                        size={Button.Sizes.SMALL}
                        onClick={() =>
                            promptFolderName({
                                title: "New GIF folder",
                                submitLabel: "Create",
                                onSubmit: name => {
                                    const id = createFolder(name);
                                    if (id) setSelectedId(id);
                                }
                            })
                        }
                    >
                        + New folder
                    </Button>
                </div>

                {folder && (
                    <div style={{ display: "flex", gap: 8, padding: "4px 0 8px" }}>
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.PRIMARY}
                            onClick={() =>
                                promptFolderName({
                                    title: "Rename folder",
                                    submitLabel: "Save",
                                    initial: folder.name,
                                    onSubmit: name => renameFolder(folder.id, name)
                                })
                            }
                        >
                            Rename
                        </Button>
                        <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={confirmDelete}>
                            Delete folder
                        </Button>
                    </div>
                )}

                {gifs.length === 0 ? (
                    <Text variant="text-md/normal" style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)" }}>
                        {folder
                            ? "This folder is empty. Go to “All favourites” and use the Folders button on a GIF, or right-click a GIF in chat."
                            : "You don't have any favourited GIFs yet."}
                    </Text>
                ) : (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                            gap: 8,
                            padding: "8px 0 16px"
                        }}
                    >
                        {gifs.map(gif => (
                            <GifTile
                                key={gif.url}
                                gif={gif}
                                inFolder={!!folder}
                                folderCount={folders.filter(f => f.gifs.includes(gif.url)).length}
                                onPick={() => pick(gif)}
                                onRemove={() => folder && removeGifFromFolder(folder.id, gif.url)}
                            />
                        ))}
                    </div>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

export function openGifFoldersModal() {
    openModal(p => <GifFoldersModal modalProps={p} />);
}
