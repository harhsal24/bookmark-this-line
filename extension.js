const vscode = require("vscode");
const path = require("path");

/**
 * @typedef {{ uri: string, line: number, content: string, group: string }} Bookmark
 */

async function activate(context) {
  // 1) Read config correctly
  const config         = vscode.workspace.getConfiguration("bookmarkExtension");
  const userGroupColors = config.get("groupColors", {});
  const defaultColors   = config.get("defaultColors", ["#fff59d"]);
  const defaultOpacity  = config.get("opacity", 0.3);

    // --- State helpers ---
  const getBookmarks = () => context.workspaceState.get("bookmarks", []);
  const saveBookmarks = (bms) =>
    context.workspaceState.update("bookmarks", bms);
  const getGroups = () => context.workspaceState.get("bookmarkGroups", {});
   // now marked async, so callers can `await` it
 const saveGroups = async (groups) =>
   await context.workspaceState.update("bookmarkGroups", groups);
  const getActiveGroup = () =>
    context.workspaceState.get("activeBookmarkGroup");
  const setActiveGroup = (name) =>
    context.workspaceState.update("activeBookmarkGroup", name);

  const decorationTypes = new Map();

   // --- Color helper ---
  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const x = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return Math.round(255 * x);
    };
    const toHex = (v) => v.toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  function withAlpha(hex, alpha) {
    // strip any leading '#'
    const clean = hex.replace("#", "");
    const a = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${clean}${a}`;
  }

     // --- Decorations ---
  function ensureDecorationForGroup(grp, forceRefresh = false) {
  const config = vscode.workspace.getConfiguration("bookmarkExtension");
  const opacity = config.get("opacity", 0.3);

  let color = getGroups()[grp];
  if (!color) {
    color = hslToHex(Math.random() * 360, 70, 80);
    saveGroups({ ...getGroups(), [grp]: color });
  }

  if (forceRefresh || !decorationTypes.has(grp)) {
    if (decorationTypes.has(grp)) {
      decorationTypes.get(grp).dispose();
    }
    decorationTypes.set(
      grp,
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: withAlpha(color, opacity),
        gutterIconPath: makeIconUri(color),
        gutterIconSize: "contain",
      })
    );
  }
}



  function makeIconUri(color) {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
      <path fill="${color}" d="M6 4C4.895 4 4 4.895 4 6V20L12 16L20 20V6C20 4.895 19.105 4 18 4H6Z"/>
    </svg>`;
    return vscode.Uri.parse(
      `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    );
  }

  

  // --- Initialize groups and activeGroup ---
 // 2) Seed your groups (overrides → saved → defaults):
  let groupColors = getGroups();
  Object.assign(groupColors, userGroupColors);
  if (Object.keys(groupColors).length === 0) {
    groupColors = { Default: defaultColors[0] };
    await saveGroups(groupColors);
  }


  let activeGroup = getActiveGroup();
  if (!activeGroup || !groupColors[activeGroup]) {
    activeGroup = Object.keys(groupColors)[0];
    setActiveGroup(activeGroup);
  }


  function updateDecorations(editor) {
    if (!editor) return;
    const uri = editor.document.uri.toString();
    const rangesMap = new Map();
    for (const b of getBookmarks()) {
      if (b.uri === uri && b.line < editor.document.lineCount) {
        if (!decorationTypes.has(b.group)) ensureDecorationForGroup(b.group);
        const deco = decorationTypes.get(b.group);
        // const lineText = editor.document.lineAt(b.line).text;
        const range = editor.document.lineAt(b.line).range;
        (rangesMap.get(deco) || rangesMap.set(deco, []).get(deco)).push(range);
      }
    }
    for (const deco of decorationTypes.values())
      editor.setDecorations(deco, []);
    for (const [deco, ranges] of rangesMap) editor.setDecorations(deco, ranges);
  }

  function updateAllDecorations() {
    vscode.window.visibleTextEditors.forEach(updateDecorations);
  }

  async function updateCursorContext() {
    const e = vscode.window.activeTextEditor;
    if (!e)
      return vscode.commands.executeCommand(
        "setContext",
        "bm.isBookmarkedLine",
        false
      );
    const uri = e.document.uri.toString();
    const line = e.selection.active.line;
    const exists = getBookmarks().some(
      (b) => b.uri === uri && b.line === line && b.group === activeGroup
    );
    vscode.commands.executeCommand("setContext", "bm.isBookmarkedLine", exists);
  }

  // --- Tree Items ---
  class GroupItem extends vscode.TreeItem {
    constructor(name) {
      const isActive = name === activeGroup;
      super(
        isActive ? `${name} ⭐` : name,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      this.group = name;
      this.contextValue = "bookmarkGroupItem";
      this.iconPath = new vscode.ThemeIcon(isActive ? "star-full" : "folder");
      this.tooltip = isActive
        ? `${name} (Active Group)`
        : `${name} (Click to view bookmarks)`;
    }
  }

  class BookmarkItem extends vscode.TreeItem {
    constructor(bookmark) {
      const u = vscode.Uri.parse(bookmark.uri);
      super(
        `${path.basename(u.fsPath)}:${bookmark.line + 1} ${bookmark.content}`,
        vscode.TreeItemCollapsibleState.None
      );
      this.bookmark = bookmark;
      this.contextValue = "bookmarkItem";
      this.tooltip = `${u.fsPath} (Line ${bookmark.line + 1})`;
      this.command = {
        command: "bm.openBookmark",
        title: "Open Bookmark",
        arguments: [this],
      };
    }
  }

  class ActiveGroupItem extends vscode.TreeItem {
    constructor(name) {
      super(`Active: ${name}`, vscode.TreeItemCollapsibleState.None);
      this.contextValue = "activeGroupItem";
      this.iconPath = new vscode.ThemeIcon("star-full");
      this.tooltip = `Currently active bookmark group: ${name}`;
    }
  }

  // --- TreeDataProviders ---
  class GroupsProvider {
    constructor() {
      this._onDidChange = new vscode.EventEmitter();
      this.onDidChangeTreeData = this._onDidChange.event;
    }
    refresh() {
      this._onDidChange.fire();
    }
    getTreeItem(item) {
      return item;
    }
    getChildren(item) {
      if (!item) {
        return Promise.resolve(
          Object.keys(getGroups()).map((g) => new GroupItem(g))
        );
      }
      return Promise.resolve(
        getBookmarks()
          .filter((b) => b.group === item.group)
          .map((b) => new BookmarkItem(b))
      );
    }
    handleDrag(source, data) {
      if (source instanceof GroupItem) {
        data.set(
          "application/vnd.code.tree.bookmarkGroup",
          new vscode.DataTransferItem({
            type: "group",
            groupName: source.group,
          })
        );
      } else if (source instanceof BookmarkItem) {
        data.set(
          "application/vnd.code.tree.bookmarkItem",
          new vscode.DataTransferItem({
            type: "bookmark",
            bookmark: source.bookmark,
          })
        );
      }
    }
    async handleDrop(target, data) {
      const transfer = data.get("application/vnd.code.tree.bookmarkItem");
      if (transfer?.value?.type === "bookmark" && target instanceof GroupItem) {
        const { bookmark } = transfer.value;
        if (bookmark.group !== target.group) {
          const all = getBookmarks();
          const idx = all.findIndex(
            (b) =>
              b.uri === bookmark.uri &&
              b.line === bookmark.line &&
              b.group === bookmark.group
          );
          all[idx].group = target.group;
          await saveBookmarks(all);
          this.refresh();
          bookmarksProv.refresh();
          updateAllDecorations();
          vscode.window.showInformationMessage(
            `Bookmark moved to group: ${target.group}`
          );
        }
      }
    }
  }

  class BookmarksProvider {
    constructor() {
      this._onDidChange = new vscode.EventEmitter();
      this.onDidChangeTreeData = this._onDidChange.event;
    }
    refresh() {
      this._onDidChange.fire();
    }
    getTreeItem(item) {
      return item;
    }
    getChildren(item) {
      if (!item) {
        // Group bookmarks by file under the active group
        const grouped = {};
        for (const b of getBookmarks().filter((b) => b.group === activeGroup)) {
          // use only the file name
          const fileName = vscode.Uri.parse(b.uri).fsPath.split(path.sep).pop();
          (grouped[fileName] ||= []).push(b);
        }
        // Turn each file group into a collapsible TreeItem
        return Promise.resolve(
          Object.entries(grouped).map(([file, bms]) => {
            const fileItem = new vscode.TreeItem(
              file,
              vscode.TreeItemCollapsibleState.Collapsed
            );
            // stash the bookmarks on the item for getChildren below
            fileItem.bookmarks = bms;
            return fileItem;
          })
        );
      }
      // When dropping into a file node, show its bookmarks sorted by line
      if (item.bookmarks instanceof Array) {
        const sorted = item.bookmarks.sort((a, b) => a.line - b.line);
        return Promise.resolve(sorted.map((b) => new BookmarkItem(b)));
      }
      return Promise.resolve([]);
    }

    handleDrag(source, data) {
      if (source instanceof BookmarkItem) {
        data.set(
          "application/vnd.code.tree.bookmarkItem",
          new vscode.DataTransferItem({
            type: "bookmark",
            bookmark: source.bookmark,
          })
        );
      }
    }
    async handleDrop(target, data) {
      const transfer = data.get("application/vnd.code.tree.bookmarkGroup");
      if (transfer?.value?.type === "group") {
        activeGroup = transfer.value.groupName;
        await setActiveGroup(activeGroup);
        groupsProv.refresh();
        this.refresh();
        updateAllDecorations();
        updateCursorContext();
        vscode.window.showInformationMessage(
          `📌 Active group changed to: ${activeGroup}`
        );
      }
    }
  }

  // --- Create TreeViews ---
  const groupsProv = new GroupsProvider();
  const bookmarksProv = new BookmarksProvider();

  vscode.window.createTreeView("bookmarkGroupsView", {
    treeDataProvider: groupsProv,
    dragAndDropController: groupsProv,
    dragMimeTypes: [
      "application/vnd.code.tree.bookmarkGroup",
      "application/vnd.code.tree.bookmarkItem",
    ],
    dropMimeTypes: ["application/vnd.code.tree.bookmarkItem"],
  });

  const viewBookmarks = vscode.window.createTreeView("bookmarksView", {
    treeDataProvider: bookmarksProv,
    dragAndDropController: bookmarksProv,
    dragMimeTypes: ["application/vnd.code.tree.bookmarkItem"],
    dropMimeTypes: ["application/vnd.code.tree.bookmarkGroup"],
  });
  viewBookmarks.title = `Bookmarks: ${activeGroup}`;

  // --- Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand("bm.toggleBookmark", async () => {
      const e = vscode.window.activeTextEditor;
      if (!e) return vscode.window.showInformationMessage("Open a file first.");
      const uri = e.document.uri.toString();
      const line = e.selection.active.line;
      const content = e.document.lineAt(line).text.trim();

      let groups = getGroups();
      if (!groups[activeGroup]) {
        const names = Object.keys(groups);
        if (!names.length) {
          groups["Default"] = "#fff59d";
          saveGroups(groups);
        }
        activeGroup = names[0] || "Default";
        await setActiveGroup(activeGroup);
      }

      const bms = getBookmarks();
      const idx = bms.findIndex(
        (b) => b.uri === uri && b.line === line && b.group === activeGroup
      );
      if (idx >= 0) {
        bms.splice(idx, 1);
        vscode.window.showInformationMessage("Bookmark removed");
      } else {
        bms.push({ uri, line, content, group: activeGroup });
        vscode.window.showInformationMessage(
          `Bookmark added to ${activeGroup}`
        );
      }
      await saveBookmarks(bms);
      groupsProv.refresh();
      bookmarksProv.refresh();
      updateAllDecorations();
      updateCursorContext();
    }),
    vscode.commands.registerCommand("bm.clearBookmarks", async () => {
      const active = getBookmarks().filter((b) => b.group === activeGroup);
      if (!active.length)
        return vscode.window.showInformationMessage("No bookmarks to clear");
      const confirm = await vscode.window.showWarningMessage(
        `Clear ${active.length} bookmarks from "${activeGroup}"?`,
        { modal: true },
        "Yes"
      );
      if (confirm !== "Yes") return;
      const filtered = getBookmarks().filter((b) => b.group !== activeGroup);
      await saveBookmarks(filtered);
      groupsProv.refresh();
      bookmarksProv.refresh();
      updateAllDecorations();
      updateCursorContext();
      vscode.window.showInformationMessage(
        `Cleared bookmarks from ${activeGroup}`
      );
    }),
    vscode.commands.registerCommand("bm.openBookmark", async (item) => {
      // item may be a TreeItem with .bookmark
      const bm = item?.bookmark;
      if (!bm) {
        return vscode.window.showInformationMessage("Not a bookmark entry");
      }
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(bm.uri)
      );
      const ed = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(bm.line, 0);
      ed.selection = new vscode.Selection(pos, pos);
      ed.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenter
      );
    }),
    vscode.commands.registerCommand("bm.removeBookmark", async (item) => {
      const bm = item?.bookmark;
      if (bm) {
        const all = getBookmarks();
        const idx = all.findIndex(
          (b) => b.uri === bm.uri && b.line === bm.line && b.group === bm.group
        );
        if (idx >= 0) {
          all.splice(idx, 1);
          await saveBookmarks(all);
          groupsProv.refresh();
          bookmarksProv.refresh();
          updateAllDecorations();
          updateCursorContext();
          vscode.window.showInformationMessage("Bookmark removed");
        }
      }
    }),
    vscode.commands.registerCommand("bm.moveBookmarkToGroup", async (item) => {
      const bm = item?.bookmark;
      if (!bm) return;
      const groups = Object.keys(getGroups()).filter((g) => g !== bm.group);
      if (!groups.length)
        return vscode.window.showInformationMessage("No other groups");
      const target = await vscode.window.showQuickPick(groups, {
        placeHolder: "Move to which group?",
      });
      if (!target) return;
      const all = getBookmarks();
      const idx = all.findIndex(
        (b) => b.uri === bm.uri && b.line === bm.line && b.group === bm.group
      );
      if (idx >= 0) {
        all[idx].group = target;
        await saveBookmarks(all);
        groupsProv.refresh();
        bookmarksProv.refresh();
        updateAllDecorations();
        vscode.window.showInformationMessage(`Moved to ${target}`);
      }
    }),
    vscode.commands.registerCommand("bm.setActiveGroup", async (item) => {
      if (!item?.group) return;
      activeGroup = item.group;
      await setActiveGroup(activeGroup);
      groupsProv.refresh();
      bookmarksProv.refresh();
      viewBookmarks.title = `Bookmarks: ${activeGroup}`;
      updateAllDecorations();
      updateCursorContext();
    }),
    vscode.commands.registerCommand("bm.createGroup", async () => {
      const name = await vscode.window.showInputBox({
        prompt: "New group name",
      });
      if (!name) return;

      const groups = getGroups();
      if (groups[name]) {
        return vscode.window.showWarningMessage("Group already exists");
      }

      // 1) pick a hue at random (or from your palette)
      const hue = Math.random() * 360;
      const saturation = 70; // percent
      const lightness = 80; // percent

       // 2) build a base hex color via our helper
      const color = hslToHex(hue, saturation, lightness);

      // 3) save it
      groups[name] = color;
      await saveGroups(groups);

      // 4) let our helper create the decoration (with correct opacity)
    ensureDecorationForGroup(name, true);
      // 5) activate & refresh
      activeGroup = name;
      await setActiveGroup(name);
      groupsProv.refresh();
      bookmarksProv.refresh();
      viewBookmarks.title = `Bookmarks: ${activeGroup}`;
      updateAllDecorations();
      updateCursorContext();
    }),
    vscode.commands.registerCommand("bm.renameGroup", async (item) => {
      const old = item?.group;
      if (!old) return;
      const newName = await vscode.window.showInputBox({
        prompt: `Rename "${old}" to:`,
        value: old,
      });
      if (!newName || newName === old) return;
      const groups = getGroups();
      if (groups[newName]) return vscode.window.showWarningMessage("Exists");
      const color = groups[old];
      delete groups[old];
      groups[newName] = color;
      await saveGroups(groups);
      const bms = getBookmarks().map((b) =>
        b.group === old ? { ...b, group: newName } : b
      );
      await saveBookmarks(bms);
      decorationTypes.delete(old);
      // recreate using our helper (reads the saved color *and* the opacity setting)
 ensureDecorationForGroup(newName, true);
      if (activeGroup === old) {
        activeGroup = newName;
        await setActiveGroup(newName);
        viewBookmarks.title = `Bookmarks: ${activeGroup}`;
      }
      groupsProv.refresh();
      bookmarksProv.refresh();
      updateAllDecorations();
      updateCursorContext();
    }),
    vscode.commands.registerCommand("bm.deleteGroup", async (item) => {
      const name = item?.group;
      if (!name) return;
      const count = getBookmarks().filter((b) => b.group === name).length;
      const confirm = await vscode.window.showWarningMessage(
        `Delete "${name}" and ${count} bookmarks?`,
        { modal: true },
        "Yes"
      );
      if (confirm !== "Yes") return;
      const groups = getGroups();
      delete groups[name];
      await saveGroups(groups);
      const remaining = getBookmarks().filter((b) => b.group !== name);
      await saveBookmarks(remaining);
      // 3) dispose + remove the decoration type so VS Code stops drawing it
      if (decorationTypes.has(name)) {
        decorationTypes.get(name).dispose();
        decorationTypes.delete(name);
      }
      if (activeGroup === name) {
        const keys = Object.keys(groups);
        if (!keys.length) {
          groups["Default"] = "#fff59d";
          await saveGroups(groups);
          activeGroup = "Default";
        } else activeGroup = keys[0];
        await setActiveGroup(activeGroup);
      }
      groupsProv.refresh();
      bookmarksProv.refresh();
      viewBookmarks.title = `Bookmarks: ${activeGroup}`;
      updateAllDecorations();
      updateCursorContext();
    }),
    vscode.commands.registerCommand("bm.nextBookmark", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      // flatten all bookmarks in this group across files
      const all = getBookmarks()
        .filter((b) => b.group === activeGroup)
        .sort((a, b) => {
          if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
          return a.line - b.line;
        });
      if (!all.length) return;
      const currentUri = editor.document.uri.toString();
      const currentLine = editor.selection.active.line;
      // find index of current, or -1 if not exactly on a bookmark
      let idx = all.findIndex(
        (b) => b.uri === currentUri && b.line === currentLine
      );
      // advance (wrap-around)
      idx = (idx + 1) % all.length;
      const nextBm = all[idx];
      // open and navigate
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(nextBm.uri)
      );
      const ed = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(nextBm.line, 0);
      ed.selection = new vscode.Selection(pos, pos);
      ed.revealRange(new vscode.Range(pos, pos));
    }),
    vscode.commands.registerCommand("bm.prevBookmark", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const all = getBookmarks()
        .filter((b) => b.group === activeGroup)
        .sort((a, b) => {
          if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
          return a.line - b.line;
        });
      if (!all.length) return;
      const currentUri = editor.document.uri.toString();
      const currentLine = editor.selection.active.line;
      let idx = all.findIndex(
        (b) => b.uri === currentUri && b.line === currentLine
      );
      // step backwards, wrapping
      idx = (idx - 1 + all.length) % all.length;
      const prevBm = all[idx];
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(prevBm.uri)
      );
      const ed = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(prevBm.line, 0);
      ed.selection = new vscode.Selection(pos, pos);
      ed.revealRange(new vscode.Range(pos, pos));
    }),
    vscode.commands.registerCommand("bm.refreshDecorationsFromConfig", () => {
      for (const group of Object.keys(getGroups())) {
        ensureDecorationForGroup(group, true); // force recreation
      }
      updateAllDecorations();
      vscode.window.showInformationMessage(
        "Bookmark styles refreshed from config."
      );
    }),
   vscode.workspace.onDidChangeConfiguration(e => {
      // Only react when one of our three settings actually changed
      if (
        e.affectsConfiguration("bookmarkExtension.groupColors") ||
        e.affectsConfiguration("bookmarkExtension.defaultColors") ||
        e.affectsConfiguration("bookmarkExtension.opacity")
      ) {
        // 2) Re-read the fresh values:
        const config            = vscode.workspace.getConfiguration("bookmarkExtension");
        const userGroupColors = config.get("groupColors", {});
        const defaultColors   = config.get("defaultColors", ["#fff59d"]);
        const opacity         = config.get("opacity", 0.3);

        // 3) (Optional) If you want to rebuild your group‐map from
        //    the new groupColors/defaultColors, do so here:
        // let groups = getGroups();
        // Object.assign(groups, userGroupColors);
        // if (!Object.keys(groups).length) {
        //   groups = { Default: defaultColors[0] };
        //   saveGroups(groups);
        // }

        // 4) Force–refresh every decoration so it picks up new opacity/colors
        for (const group of Object.keys(getGroups())) {
          ensureDecorationForGroup(group, /* forceRefresh */ true);
        }

        // 5) Repaint all open editors
        updateAllDecorations();

        // 6) Notify the user
        vscode.window.showInformationMessage(
          "🔧 Bookmark Extension settings have been applied."
        );
      }
    }),
    // --- Keep bookmarks in sync with edits ---
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const changes = event.contentChanges;
      const docUri = event.document.uri.toString();
      if (!changes.length) return;
      let bms = getBookmarks();
      for (const change of changes) {
        const oldCount = change.range.end.line - change.range.start.line + 1;
        const newCount = change.text.split("\n").length;
        const delta = newCount - oldCount;
        if (delta === 0) continue;
        for (let bm of bms) {
          // only shift bookmarks in the *same* file
          if (bm.uri === docUri && change.range.start.line < bm.line) {
            bm.line = Math.max(0, bm.line + delta);
          }
        }
      }
      await saveBookmarks(bms);
      updateAllDecorations();
    }),
    // legacy decoration repaint
    vscode.workspace.onDidChangeTextDocument(updateAllDecorations),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateDecorations(editor);
      updateCursorContext();
    }),
    vscode.window.onDidChangeTextEditorSelection(updateCursorContext)
  )

  // --- Initial render ---
  updateAllDecorations();
  updateCursorContext();

}

function deactivate() {}

module.exports = { activate, deactivate };
