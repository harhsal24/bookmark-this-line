const vscode = require('vscode');
const path = require('path');

/**
 * @typedef {{ uri: string, line: number, content: string, group: string }} Bookmark
 */

function activate(context) {
    // Helpers to get/save bookmarks and groups:
    function getBookmarks() {
        return context.workspaceState.get('bookmarks', []);
    }
    function saveBookmarks(bms) {
        return context.workspaceState.update('bookmarks', bms);
    }
    function getGroups() {
        return context.workspaceState.get('bookmarkGroups', {});
    }
    function saveGroups(obj) {
        return context.workspaceState.update('bookmarkGroups', obj);
    }

    // Utility: convert HSL to hex for pastel colors
    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const x = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
            return Math.round(255 * x);
        };
        const toHex = v => v.toString(16).padStart(2, '0');
        const r = f(0), g = f(8), b = f(4);
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // Decoration types per group
    const decorationTypes = new Map();

    // Initialize groups/colors
    let groupColors = context.workspaceState.get('bookmarkGroups', {});
    if (Object.keys(groupColors).length === 0) {
        const defaultColor = '#fff59d';
        groupColors['Default'] = defaultColor;
        context.workspaceState.update('bookmarkGroups', groupColors);
    }
    for (const [grp, color] of Object.entries(groupColors)) {
        const deco = vscode.window.createTextEditorDecorationType({ backgroundColor: color });
        decorationTypes.set(grp, deco);
    }

    // Tree provider for sidebar
    const bookmarkProvider = new BookmarkProvider(context);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('bookmarksView', bookmarkProvider)
    );

    // Ensure decoration exists for a group
    function ensureDecorationForGroup(group) {
        if (!decorationTypes.has(group)) {
            const colors = getGroups();
            const col = colors[group] || hslToHex(Math.random()*360, 70, 80);
            if (!colors[group]) {
                colors[group] = col;
                saveGroups(colors);
            }
            const deco = vscode.window.createTextEditorDecorationType({ backgroundColor: col });
            decorationTypes.set(group, deco);
        }
    }

    // Update decorations in one editor
    function updateDecorationsForEditor(editor) {
        if (!editor) return;
        const uri = editor.document.uri.toString();
        const rangesMap = new Map();
        for (const b of getBookmarks()) {
            if (b.uri === uri && b.line < editor.document.lineCount) {
                ensureDecorationForGroup(b.group);
                const deco = decorationTypes.get(b.group);
                const lineText = editor.document.lineAt(b.line).text;
                const range = new vscode.Range(b.line, 0, b.line, lineText.length);
                if (!rangesMap.has(deco)) rangesMap.set(deco, [range]);
                else rangesMap.get(deco).push(range);
            }
        }
        // Clear all then set
        for (const deco of decorationTypes.values()) {
            editor.setDecorations(deco, []);
        }
        for (const [deco, ranges] of rangesMap.entries()) {
            editor.setDecorations(deco, ranges);
        }
    }
    function updateAllDecorations() {
        for (const editor of vscode.window.visibleTextEditors) {
            updateDecorationsForEditor(editor);
        }
    }

    // Context key updater for "is cursor on bookmarked line?"
    async function updateCursorBookmarkContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await vscode.commands.executeCommand('setContext', 'bm.isBookmarkedLine', false);
            return;
        }
        const uri = editor.document.uri.toString();
        const lineNum = editor.selection.active.line;
        const exists = getBookmarks().some(b => b.uri === uri && b.line === lineNum);
        await vscode.commands.executeCommand('setContext', 'bm.isBookmarkedLine', exists);
    }

    // Subscribe context updates
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(updateCursorBookmarkContext),
        vscode.window.onDidChangeActiveTextEditor(updateCursorBookmarkContext)
    );
    // Initial context
    updateCursorBookmarkContext();

    // Toggle bookmark command
    context.subscriptions.push(vscode.commands.registerCommand('bm.toggleBookmark', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor to toggle bookmark.');
            return;
        }
        const doc = editor.document;
        const uri = doc.uri.toString();
        const lineNum = editor.selection.active.line;
        const content = doc.lineAt(lineNum).text.trim();
        let groups = getGroups();
        const groupNames = Object.keys(groups);
        let chosenGroup;
        if (groupNames.length === 1) {
            chosenGroup = groupNames[0];
        } else {
            const picks = [...groupNames, '$(plus) Create new group'];
            const sel = await vscode.window.showQuickPick(picks, { placeHolder: 'Select bookmark group' });
            if (!sel) return;
            if (sel === '$(plus) Create new group') {
                const name = await vscode.window.showInputBox({ prompt: 'Enter new group name' });
                if (!name) {
                    vscode.window.showWarningMessage('Group creation cancelled.');
                    return;
                }
                if (groups[name]) {
                    vscode.window.showWarningMessage(`Group "${name}" already exists.`);
                    chosenGroup = name;
                } else {
                    const color = hslToHex(Math.random()*360, 70, 80);
                    groups[name] = color;
                    await saveGroups(groups);
                    const deco = vscode.window.createTextEditorDecorationType({ backgroundColor: color });
                    decorationTypes.set(name, deco);
                    chosenGroup = name;
                }
            } else {
                chosenGroup = sel;
            }
        }
        const bms = getBookmarks();
        const idx = bms.findIndex(b => b.uri === uri && b.line === lineNum && b.group === chosenGroup);
        if (idx >= 0) {
            bms.splice(idx, 1);
            vscode.window.showInformationMessage(`Removed bookmark on toggle: ${path.basename(doc.uri.fsPath)}:${lineNum+1}`);
        } else {
            bms.push({ uri, line: lineNum, content, group: chosenGroup });
            vscode.window.showInformationMessage(`Added bookmark: ${path.basename(doc.uri.fsPath)}:${lineNum+1} [${chosenGroup}]`);
        }
        await saveBookmarks(bms);
        bookmarkProvider.refresh();
        updateAllDecorations();
        updateCursorBookmarkContext();
    }));

    // Remove bookmark command
    context.subscriptions.push(vscode.commands.registerCommand('bm.removeBookmark', async (item) => {
        // If invoked from sidebar (item.bookmark present)
        if (item && item.bookmark) {
            const { uri, line, group } = item.bookmark;
            const bms = getBookmarks();
            const idx = bms.findIndex(b => b.uri === uri && b.line === line && b.group === group);
            if (idx >= 0) {
                bms.splice(idx, 1);
                await saveBookmarks(bms);
                bookmarkProvider.refresh();
                updateAllDecorations();
                vscode.window.showInformationMessage(`Removed bookmark: ${path.basename(vscode.Uri.parse(uri).fsPath)}:${line+1}`);
                updateCursorBookmarkContext();
            } else {
                vscode.window.showWarningMessage('Bookmark not found in state.');
            }
        } else {
            // Remove bookmark at current cursor line
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('No active editor.');
                return;
            }
            const doc = editor.document;
            const uri = doc.uri.toString();
            const lineNum = editor.selection.active.line;
            const bms = getBookmarks();
            const matches = bms.filter(b => b.uri === uri && b.line === lineNum);
            if (matches.length === 0) {
                vscode.window.showInformationMessage('No bookmark on current line to remove.');
                return;
            }
            if (matches.length === 1) {
                const { group } = matches[0];
                const idx = bms.findIndex(b => b.uri === uri && b.line === lineNum && b.group === group);
                bms.splice(idx, 1);
                await saveBookmarks(bms);
                bookmarkProvider.refresh();
                updateAllDecorations();
                vscode.window.showInformationMessage(`Removed bookmark: ${path.basename(doc.uri.fsPath)}:${lineNum+1} [${group}]`);
                updateCursorBookmarkContext();
            } else {
                const picks = matches.map(b => ({
                    label: `[${b.group}] ${path.basename(doc.uri.fsPath)}:${lineNum+1}`,
                    description: b.content,
                    bookmark: b
                }));
                const sel = await vscode.window.showQuickPick(picks, { placeHolder: 'Multiple bookmarks here; pick which to remove' });
                if (!sel) return;
                const b = sel.bookmark;
                const idx = bms.findIndex(x => x.uri === b.uri && x.line === b.line && x.group === b.group);
                if (idx >= 0) {
                    bms.splice(idx, 1);
                    await saveBookmarks(bms);
                    bookmarkProvider.refresh();
                    updateAllDecorations();
                    vscode.window.showInformationMessage(`Removed bookmark: ${path.basename(doc.uri.fsPath)}:${lineNum+1} [${b.group}]`);
                    updateCursorBookmarkContext();
                }
            }
        }
    }));

    // Clear all bookmarks
    context.subscriptions.push(vscode.commands.registerCommand('bm.clearBookmarks', async () => {
        await saveBookmarks([]);
        bookmarkProvider.refresh();
        updateAllDecorations();
        vscode.window.showInformationMessage('Cleared all bookmarks.');
        updateCursorBookmarkContext();
    }));

    // Open bookmark
    context.subscriptions.push(vscode.commands.registerCommand('bm.openBookmark', item => {
        if (!item || !item.bookmark) return;
        const uriStr = item.bookmark.uri;
        const uri = vscode.Uri.parse(uriStr);
        vscode.workspace.openTextDocument(uri).then(doc => {
            vscode.window.showTextDocument(doc).then(editor => {
                const pos = new vscode.Position(item.bookmark.line, 0);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            });
        });
    }));

    // Hook decoration updates
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateDecorationsForEditor),
        vscode.window.onDidChangeTextDocument(() => updateAllDecorations())
    );

    // Initial decorations
    updateAllDecorations();
}

function deactivate() {
    // nothing to clean up
}

class BookmarkItem extends vscode.TreeItem {
    constructor(bookmark) {
        const uriObj = vscode.Uri.parse(bookmark.uri);
        const fileName = path.basename(uriObj.fsPath);
        let label;
        if (bookmark.group === 'Default') {
            label = `${fileName}:${bookmark.line + 1} ${bookmark.content}`;
        } else {
            label = `${bookmark.group} — ${fileName}:${bookmark.line + 1} ${bookmark.content}`;
        }
        super(label, vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: 'bm.openBookmark',
            title: 'Open Bookmark',
            arguments: [this]
        };
        this.tooltip = `${uriObj.fsPath} (Line ${bookmark.line + 1}) [Group: ${bookmark.group}]`;
        this.bookmark = bookmark;
        this.contextValue = 'bookmarkItem';
    }
}

class BookmarkProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        const bms = this.context.workspaceState.get('bookmarks', []);
        const items = bms.map(b => new BookmarkItem(b));
        return Promise.resolve(items);
    }
}

module.exports = { activate, deactivate };
