/*
 * GIF Folders - a Vencord plugin
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { ApplicationCommandInputType } from "@api/Commands";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";

import { getFavorite, GifRef, loadFolders, settings } from "./store";
import { buildFolderMenuItems, openGifFoldersModal } from "./ui";

const GIF_RE = /\.gifv?(?:[?#]|$)|tenor\.com|giphy\.com/i;

function gifFromMenuProps(props: any): GifRef | null {
    const href = props?.itemHref ?? props?.href;
    const srcProp = props?.itemSrc ?? props?.itemSafeSrc ?? props?.src;
    const url: unknown = href ?? srcProp;
    if (typeof url !== "string" || !url) return null;

    const looksLikeGif =
        !!getFavorite(url) ||
        props?.favoriteableType === "GIF" ||
        GIF_RE.test(url) ||
        (typeof srcProp === "string" && GIF_RE.test(srcProp));

    return looksLikeGif ? { url, src: typeof srcProp === "string" ? srcProp : undefined } : null;
}

const gifContextPatch: NavContextMenuPatchCallback = (children, props) => {
    const gif = gifFromMenuProps(props);
    if (!gif) return;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem id="vc-gif-folders" label="GIF Folders">
            {buildFolderMenuItems(gif)}
        </Menu.MenuItem>
    );
};

function FolderIcon({ className }: { className?: string; }) {
    return (
        <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
        </svg>
    );
}

const GifFoldersButton: ChatBarButtonFactory = ({ isMainChat }) => {
    if (!isMainChat) return null;
    return (
        <ChatBarButton tooltip="GIF Folders" onClick={openGifFoldersModal}>
            <FolderIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "GifFolders",
    description:
        "Organise your favourite GIFs into your own named folders. A GIF can live in several folders, and folders never touch your Discord favourites.",
    authors: [{ name: "You", id: 0n }],
    settings,

    contextMenus: {
        message: gifContextPatch,
        "image-context": gifContextPatch
    },

    chatBarButton: {
        icon: FolderIcon,
        render: GifFoldersButton
    },
    
    commands: [
        {
            name: "gif-folders",
            description: "Open the GIF folder manager",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: () => { openGifFoldersModal(); }
        }
    ],

    async start() {
        await loadFolders();
    }
});
