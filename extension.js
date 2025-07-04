  const vscode = require("vscode");
  const path = require("path");

  /**
   * @typedef {{ uri: string, fsPath: string, line: number, content: string, group: string }} Bookmark
   */

  async function activate(context) {
    // --- Performance optimizations ---
    let decorationUpdateTimeout;
    let contextUpdateTimeout;
    const DECORATION_THROTTLE_MS = 50;
    const CONTEXT_THROTTLE_MS = 100;

    // Cache frequently accessed data
    let bookmarksCache = null;
    let groupsCache = null;
    let activeGroupCache = null;
    let configCache = null;

    // Track dirty state to avoid unnecessary operations
    let isDirtyBookmarks = true;
    let isDirtyGroups = true;
    let isDirtyConfig = true;

    // --- Optimized State helpers ---
    const getBookmarks = () => {
      if (isDirtyBookmarks || !bookmarksCache) {
        bookmarksCache = context.workspaceState.get("bookmarks", []);
        isDirtyBookmarks = false;
      }
      return bookmarksCache;
    };

    const saveBookmarks = async (bms) => {
      bookmarksCache = bms;
      isDirtyBookmarks = false;
      return context.workspaceState.update("bookmarks", bms);
    };

    const getGroups = () => {
      if (isDirtyGroups || !groupsCache) {
        groupsCache = context.workspaceState.get("bookmarkGroups", {});
        isDirtyGroups = false;
      }
      return groupsCache;
    };

    const saveGroups = async (groups) => {
      groupsCache = groups;
      isDirtyGroups = false;
      return context.workspaceState.update("bookmarkGroups", groups);
    };

    const getActiveGroup = () => {
      if (!activeGroupCache) {
        activeGroupCache = context.workspaceState.get("activeBookmarkGroup");
      }
      return activeGroupCache;
    };

    const setActiveGroup = async (name) => {
      activeGroupCache = name;
      activeGroup = name;
      return context.workspaceState.update("activeBookmarkGroup", name);
    };

    const decorationTypes = new Map();
    let activeGroup;

    // --- Optimized Config helper with caching ---
    function getConfig() {
      if (isDirtyConfig || !configCache) {
        const config = vscode.workspace.getConfiguration("bookmarkExtension");
        configCache = {
          userGroupColors: config.get("groupColors", {}),
          defaultColors: config.get("defaultColors", ["#fff59d"]),
          opacity: config.get("opacity", 0.3),
        };
        isDirtyConfig = false;
      }
      return configCache;
    }

    // --- Optimized Color helpers (memoized) ---
    const colorCache = new Map();

    function hslToHex(h, s, l) {
      const key = `${h}-${s}-${l}`;
      if (colorCache.has(key)) return colorCache.get(key);

      s /= 100;
      l /= 100;
      const k = (n) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n) => {
        const x = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(255 * x);
      };
      const toHex = (v) => v.toString(16).padStart(2, "0");
      const result = `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;

      colorCache.set(key, result);
      return result;
    }

    const alphaCache = new Map();
    function withAlpha(hex, alpha) {
      const key = `${hex}-${alpha}`;
      if (alphaCache.has(key)) return alphaCache.get(key);

      const clean = hex.replace("#", "");
      const a = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0");
      const result = `#${clean}${a}`;

      alphaCache.set(key, result);
      return result;
    }

    // --- Optimized Decorations ---
    const iconCache = new Map();

    function makeIconUri(color) {
      if (iconCache.has(color)) return iconCache.get(color);

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="${color}" d="M6 4C4.895 4 4 4.895 4 6V20L12 16L20 20V6C20 4.895 19.105 4 18 4H6Z"/></svg>`;
      const uri = vscode.Uri.parse(
        `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
      );

      iconCache.set(color, uri);
      return uri;
    }

    function ensureDecorationForGroup(grp, forceRefresh = false) {
      const { opacity } = getConfig();
      let groups = getGroups();

      let color = groups[grp];
      if (!color) {
        color = hslToHex(Math.random() * 360, 70, 80);
        groups[grp] = color;
        saveGroups(groups);
      }

      if (forceRefresh || !decorationTypes.has(grp)) {
        const existing = decorationTypes.get(grp);
        if (existing) existing.dispose();

        decorationTypes.set(
          grp,
          vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: withAlpha(color, opacity),

            // show a colored marker in the overview ruler (right gutter)
            overviewRulerColor: withAlpha(color, opacity),
            overviewRulerLane: vscode.OverviewRulerLane.Right,

            // show a colored stripe in the minimap
            minimap: {
              color: withAlpha(color, opacity),
              position: "gutter",
            },

            gutterIconPath: makeIconUri(color),
            gutterIconSize: "contain",
          })
        );
      }
    }

    // --- Initialize groups and activeGroup ---
    async function initializeGroupsAndColors() {
      const { userGroupColors, defaultColors } = getConfig();
      let groupColors = getGroups();

      Object.assign(groupColors, userGroupColors);

      if (Object.keys(groupColors).length === 0) {
        groupColors = { Default: defaultColors[0] };
      }

      await saveGroups(groupColors);

      let active = getActiveGroup();
      if (!active || !groupColors[active]) {
        active = Object.keys(groupColors)[0];
        await setActiveGroup(active);
      }
      activeGroup = active;

      return groupColors;
    }

    // --- Optimized config changes ---
    async function applyConfigChanges() {
      isDirtyConfig = true; // Force config refresh
      const { userGroupColors, defaultColors } = getConfig();
      let groups = getGroups();

      // Batch updates
      const updates = {};
      for (const [groupName, configColor] of Object.entries(userGroupColors)) {
        if (groups[groupName]) {
          updates[groupName] = configColor;
        }
      }

      if (groups.Default && defaultColors.length > 0) {
        updates.Default = defaultColors[0];
      }

      Object.assign(groups, updates);
      await saveGroups(groups);

      // Batch decoration refresh
      const groupsToRefresh = Object.keys(updates);
      for (const group of groupsToRefresh) {
        ensureDecorationForGroup(group, true);
      }

      throttledUpdateAllDecorations();
    }

    // --- Optimized decoration updates with throttling ---
    function updateDecorations(editor) {
      if (!editor) return;

      const fsPath = editor.document.uri.fsPath;
      const rangesMap = new Map();
      const bookmarks = getBookmarks();
      const lineCount = editor.document.lineCount;

      // Single pass through bookmarks
      for (const b of bookmarks) {
        if (b.fsPath === fsPath && b.line < lineCount) {
          if (!decorationTypes.has(b.group)) {
            ensureDecorationForGroup(b.group);
          }
          const deco = decorationTypes.get(b.group);
          const range = editor.document.lineAt(b.line).range;

          if (!rangesMap.has(deco)) {
            rangesMap.set(deco, []);
          }
          rangesMap.get(deco).push(range);
        }
      }

      // Batch clear all decorations first
      for (const deco of decorationTypes.values()) {
        editor.setDecorations(deco, []);
      }

      // Batch apply new decorations
      for (const [deco, ranges] of rangesMap) {
        editor.setDecorations(deco, ranges);
      }
    }

    function throttledUpdateAllDecorations() {
      if (decorationUpdateTimeout) {
        clearTimeout(decorationUpdateTimeout);
      }
      decorationUpdateTimeout = setTimeout(() => {
        vscode.window.visibleTextEditors.forEach(updateDecorations);
        decorationUpdateTimeout = null;
      }, DECORATION_THROTTLE_MS);
    }

    function updateAllDecorations() {
      vscode.window.visibleTextEditors.forEach(updateDecorations);
    }

    async function throttledUpdateCursorContext() {
      if (contextUpdateTimeout) {
        clearTimeout(contextUpdateTimeout);
      }
      contextUpdateTimeout = setTimeout(async () => {
        const e = vscode.window.activeTextEditor;
        if (!e) {
          vscode.commands.executeCommand(
            "setContext",
            "bm.isBookmarkedLine",
            false
          );
          contextUpdateTimeout = null;
          return;
        }

        const uriFsPath = e.document.uri.fsPath;
        const line = e.selection.active.line;
        const bookmarks = getBookmarks();

        // Optimized search
        const exists = bookmarks.some(
          (b) =>
            b.fsPath === uriFsPath && b.line === line && b.group === activeGroup
        );

        vscode.commands.executeCommand(
          "setContext",
          "bm.isBookmarkedLine",
          exists
        );
        contextUpdateTimeout = null;
      }, CONTEXT_THROTTLE_MS);
    }

    // --- Optimized Tree Items (lazy loading) ---
    class GroupItem extends vscode.TreeItem {
      constructor(name, isActive) {
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
        const fileName = path.basename(u.fsPath);
        super(
          `${fileName}:${bookmark.line + 1} ${bookmark.content}`,
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

    // --- Optimized TreeDataProviders ---
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
          const groups = getGroups();
          return Promise.resolve(
            Object.keys(groups).map((g) => new GroupItem(g, g === activeGroup))
          );
        }

        const bookmarks = getBookmarks().filter((b) => b.group === item.group);
        return Promise.resolve(bookmarks.map((b) => new BookmarkItem(b)));
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
            if (idx >= 0) {
              all[idx].group = target.group;
              await saveBookmarks(all);
              this.refresh();
              bookmarksProv.refresh();
              throttledUpdateAllDecorations();
              vscode.window.showInformationMessage(
                `Bookmark moved to group: ${target.group}`
              );
            }
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
          // Optimized grouping
          const grouped = {};
          const activeBookmarks = getBookmarks().filter(
            (b) => b.group === activeGroup
          );

          for (const b of activeBookmarks) {
            const fileName = path.basename(vscode.Uri.parse(b.uri).fsPath);
            if (!grouped[fileName]) grouped[fileName] = [];
            grouped[fileName].push(b);
          }

          return Promise.resolve(
            Object.entries(grouped).map(([file, bms]) => {
              const fileItem = new vscode.TreeItem(
                file,
                vscode.TreeItemCollapsibleState.Collapsed
              );
              fileItem.bookmarks = bms;
              return fileItem;
            })
          );
        }

        if (Array.isArray(item.bookmarks)) {
          // Pre-sort for better performance
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
          await setActiveGroup(transfer.value.groupName);
          groupsProv.refresh();
          this.refresh();
          viewBookmarks.title = `Bookmarks: ${activeGroup}`;
          throttledUpdateAllDecorations();
          throttledUpdateCursorContext();
          vscode.window.showInformationMessage(
            `📌 Active group changed to: ${activeGroup}`
          );
        }
      }
    }

    // Initialize everything
    await initializeGroupsAndColors();

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

    // --- Optimized Commands ---
    context.subscriptions.push(
      vscode.commands.registerCommand("bm.toggleBookmark", async () => {
        const e = vscode.window.activeTextEditor;
        if (!e) return vscode.window.showInformationMessage("Open a file first.");

        const uri = e.document.uri.toString();
        const fsPath = e.document.uri.fsPath;
        const line = e.selection.active.line;
        const content = e.document.lineAt(line).text.trim();

        let groups = getGroups();
        if (!groups[activeGroup]) {
          const names = Object.keys(groups);
          if (!names.length) {
            const { defaultColors } = getConfig();
            groups["Default"] = defaultColors[0];
            await saveGroups(groups);
          }
          await setActiveGroup(names[0] || "Default");
        }

        const bms = getBookmarks();
        const idx = bms.findIndex(
          (b) => b.uri === uri && b.line === line && b.group === activeGroup
        );

        if (idx >= 0) {
          bms.splice(idx, 1);
          vscode.window.showInformationMessage("Bookmark removed");
        } else {
          bms.push({ uri, fsPath, line, content, group: activeGroup });
          vscode.window.showInformationMessage(
            `Bookmark added to ${activeGroup}`
          );
        }

        await saveBookmarks(bms);
        groupsProv.refresh();
        bookmarksProv.refresh();
        throttledUpdateAllDecorations();
        throttledUpdateCursorContext();
      }),

      vscode.commands.registerCommand("bm.clearBookmarks", async () => {
        const activeBookmarks = getBookmarks().filter(
          (b) => b.group === activeGroup
        );
        if (!activeBookmarks.length) {
          return vscode.window.showInformationMessage("No bookmarks to clear");
        }

        const confirm = await vscode.window.showWarningMessage(
          `Clear ${activeBookmarks.length} bookmarks from "${activeGroup}"?`,
          { modal: true },
          "Yes"
        );
        if (confirm !== "Yes") return;

        const filtered = getBookmarks().filter((b) => b.group !== activeGroup);
        await saveBookmarks(filtered);
        groupsProv.refresh();
        bookmarksProv.refresh();
        throttledUpdateAllDecorations();
        throttledUpdateCursorContext();
        vscode.window.showInformationMessage(
          `Cleared bookmarks from ${activeGroup}`
        );
      }),

      vscode.commands.registerCommand("bm.openBookmark", async (item) => {
        const bm = item?.bookmark;
        if (!bm)
          return vscode.window.showInformationMessage("Not a bookmark entry");

        try {
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
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to open bookmark: ${error.message}`
          );
        }
      }),

      vscode.commands.registerCommand("bm.removeBookmark", async (item) => {
        const bm = item?.bookmark;
        if (!bm) return;

        const all = getBookmarks();
        const idx = all.findIndex(
          (b) =>
            b.fsPath === bm.fsPath && b.line === bm.line && b.group === bm.group
        );

        if (idx >= 0) {
          all.splice(idx, 1);
          await saveBookmarks(all);
          groupsProv.refresh();
          bookmarksProv.refresh();
          throttledUpdateAllDecorations();
          throttledUpdateCursorContext();
          vscode.window.showInformationMessage("Bookmark removed");
        }
      }),

      vscode.commands.registerCommand("bm.moveBookmarkToGroup", async (item) => {
        const bm = item?.bookmark;
        if (!bm) return;

        const groups = Object.keys(getGroups()).filter((g) => g !== bm.group);
        if (!groups.length) {
          return vscode.window.showInformationMessage("No other groups");
        }

        const target = await vscode.window.showQuickPick(groups, {
          placeHolder: "Move to which group?",
        });
        if (!target) return;

        const all = getBookmarks();
        const idx = all.findIndex(
          (b) =>
            b.fsPath === bm.fsPath && b.line === bm.line && b.group === bm.group
        );

        if (idx >= 0) {
          all[idx].group = target;
          await saveBookmarks(all);
          groupsProv.refresh();
          bookmarksProv.refresh();
          throttledUpdateAllDecorations();
          vscode.window.showInformationMessage(`Moved to ${target}`);
        }
      }),

      vscode.commands.registerCommand("bm.setActiveGroup", async (item) => {
        if (!item?.group) return;

        await setActiveGroup(item.group);
        groupsProv.refresh();
        bookmarksProv.refresh();
        viewBookmarks.title = `Bookmarks: ${activeGroup}`;
        throttledUpdateAllDecorations();
        throttledUpdateCursorContext();
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

        const color = hslToHex(Math.random() * 360, 70, 80);
        groups[name] = color;
        await saveGroups(groups);

        ensureDecorationForGroup(name, true);
        await setActiveGroup(name);
        groupsProv.refresh();
        bookmarksProv.refresh();
        viewBookmarks.title = `Bookmarks: ${activeGroup}`;
        throttledUpdateAllDecorations();
        throttledUpdateCursorContext();
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
        if (groups[newName]) {
          return vscode.window.showWarningMessage("Group name already exists");
        }

        const color = groups[old];
        delete groups[old];
        groups[newName] = color;
        await saveGroups(groups);

        const bms = getBookmarks().map((b) =>
          b.group === old ? { ...b, group: newName } : b
        );
        await saveBookmarks(bms);

        // Clean up old decoration
        const oldDecoration = decorationTypes.get(old);
        if (oldDecoration) {
          oldDecoration.dispose();
          decorationTypes.delete(old);
        }

        ensureDecorationForGroup(newName, true);

        if (activeGroup === old) {
          await setActiveGroup(newName);
          viewBookmarks.title = `Bookmarks: ${activeGroup}`;
        }

        groupsProv.refresh();
        bookmarksProv.refresh();
        throttledUpdateAllDecorations();
        throttledUpdateCursorContext();
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

        // Clean up decoration
        const decoration = decorationTypes.get(name);
        if (decoration) {
          decoration.dispose();
          decorationTypes.delete(name);
        }

        if (activeGroup === name) {
          const keys = Object.keys(groups);
          if (!keys.length) {
            const { defaultColors } = getConfig();
            groups["Default"] = defaultColors[0];
            await saveGroups(groups);
            await setActiveGroup("Default");
          } else {
            await setActiveGroup(keys[0]);
          }
        }

        groupsProv.refresh();
        bookmarksProv.refresh();
        viewBookmarks.title = `Bookmarks: ${activeGroup}`;
        throttledUpdateAllDecorations();
        throttledUpdateCursorContext();
      }),

      vscode.commands.registerCommand("bm.nextBookmark", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const sorted = getBookmarks()
          .filter((b) => b.group === activeGroup)
          .sort((a, b) =>
            a.fsPath !== b.fsPath
              ? a.fsPath.localeCompare(b.fsPath)
              : a.line - b.line
          );

        if (!sorted.length) return;

        const currentFsPath = editor.document.uri.fsPath;
        const currentLine = editor.selection.active.line;
        let idx = sorted.findIndex(
          (b) => b.fsPath === currentFsPath && b.line === currentLine
        );
        idx = (idx + 1) % sorted.length;

        const nextBm = sorted[idx];
        try {
          const doc = await vscode.workspace.openTextDocument(
            vscode.Uri.parse(nextBm.uri)
          );
          const ed = await vscode.window.showTextDocument(doc);
          const pos = new vscode.Position(nextBm.line, 0);
          ed.selection = new vscode.Selection(pos, pos);
          ed.revealRange(new vscode.Range(pos, pos));
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to open bookmark: ${error.message}`
          );
        }
      }),

     vscode.commands.registerCommand("bm.prevBookmark", async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const sorted = getBookmarks()
    .filter((b) => b.group === activeGroup)
    .sort((a, b) =>
      a.fsPath !== b.fsPath
        ? a.fsPath.localeCompare(b.fsPath)
        : a.line - b.line
    );

  if (!sorted.length) return;

  const currentFsPath = editor.document.uri.fsPath;  // THIS WAS MISSING!
  const currentLine = editor.selection.active.line;
  let idx = sorted.findIndex(
    (b) => b.fsPath === currentFsPath && b.line === currentLine
  );
  idx = (idx - 1 + sorted.length) % sorted.length;

  const prevBm = sorted[idx];
  await vscode.commands.executeCommand('bm.openBookmark', { bookmark: prevBm });
}),


      vscode.commands.registerCommand(
        "bm.refreshDecorationsFromConfig",
        async () => {
          await applyConfigChanges();
          vscode.window.showInformationMessage(
            "Bookmark styles refreshed from config."
          );
        }
      ),

      // Optimized configuration change handler
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (
          e.affectsConfiguration("bookmarkExtension.groupColors") ||
          e.affectsConfiguration("bookmarkExtension.defaultColors") ||
          e.affectsConfiguration("bookmarkExtension.opacity")
        ) {
          await applyConfigChanges();
          vscode.window.showInformationMessage(
            "🔧 Bookmark Extension settings have been applied."
          );
        }
      }),

      // Optimized document change handler with debouncing
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        const changes = event.contentChanges;
        const docFsPath = event.document.uri.fsPath;
        if (!changes.length) return;

        let bms = getBookmarks();
        let hasChanges = false;

        for (const change of changes) {
          const oldCount = change.range.end.line - change.range.start.line + 1;
          const newCount = change.text.split("\n").length;
          const delta = newCount - oldCount;
          if (delta === 0) continue;

          const startLine = change.range.start.line;
          for (const bm of bms) {
            if (bm.fsPath === docFsPath && startLine < bm.line) {
              bm.line = Math.max(0, bm.line + delta);
              hasChanges = true;
            }
          }
        }

        if (hasChanges) {
          await saveBookmarks(bms);
          throttledUpdateAllDecorations();
        }
      }),

      vscode.window.onDidChangeActiveTextEditor((editor) => {
        updateDecorations(editor);
        throttledUpdateCursorContext();
      }),

      vscode.window.onDidChangeTextEditorSelection(throttledUpdateCursorContext)
    );

    // Initial render
    updateAllDecorations();
    throttledUpdateCursorContext();

    // Cleanup function for timeouts
    context.subscriptions.push({
      dispose: () => {
        if (decorationUpdateTimeout) {
          clearTimeout(decorationUpdateTimeout);
        }
        if (contextUpdateTimeout) {
          clearTimeout(contextUpdateTimeout);
        }
        // Clear caches
        colorCache.clear();
        alphaCache.clear();
        iconCache.clear();
        // Dispose decorations
        for (const decoration of decorationTypes.values()) {
          decoration.dispose();
        }
        decorationTypes.clear();
      },
    });
  }

  function deactivate() {}

  module.exports = { activate, deactivate };
