const vscode = require("vscode");
const path = require("path");

/**
 * @typedef {{ uri: string, line: number, content: string, group: string }} Bookmark
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

  const getGroupOrder = () => {
    let order = context.workspaceState.get("bookmarkGroupOrder", []);
    const groups = getGroups();
    const groupNames = Object.keys(groups);
    
    order = order.filter(name => groupNames.includes(name));
    for (const name of groupNames) {
      if (!order.includes(name)) {
        order.push(name);
      }
    }
    return order;
  };

  const saveGroupOrder = async (order) => {
    return context.workspaceState.update("bookmarkGroupOrder", order);
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
        scrollAnimation: config.get("scrollAnimation", "all"),
        flashHighlight: config.get("flashHighlight", true),
        allowCrossFileJump: config.get("allowCrossFileJump", true)
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
    const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
    const result = `#${clean}${a}`;
    
    alphaCache.set(key, result);
    return result;
  }

  // --- Optimized Decorations ---
  const iconCache = new Map();
  
  function makeIconUri(color) {
    const activeColor = color || "#fff59d";
    if (iconCache.has(activeColor)) return iconCache.get(activeColor);
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="${activeColor}" d="M6 4C4.895 4 4 4.895 4 6V20L12 16L20 20V6C20 4.895 19.105 4 18 4H6Z"/></svg>`;
    const uri = vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    
    iconCache.set(activeColor, uri);
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
      
      decorationTypes.set(grp, vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: withAlpha(color, opacity),
        gutterIconPath: makeIconUri(color),
        gutterIconSize: "contain",
      }));
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
    
    const uri = editor.document.uri.toString();
    const rangesMap = new Map();
    const bookmarks = getBookmarks();
    const lineCount = editor.document.lineCount;
    
    // Single pass through bookmarks
    for (const b of bookmarks) {
      if (b.uri === uri && b.line < lineCount) {
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
        vscode.commands.executeCommand("setContext", "bm.isBookmarkedLine", false);
        contextUpdateTimeout = null;
        return;
      }
      
      const uri = e.document.uri.toString();
      const line = e.selection.active.line;
      const bookmarks = getBookmarks();
      
      // Optimized search
      const exists = bookmarks.some(b => 
        b.uri === uri && b.line === line && b.group === activeGroup
      );
      
      vscode.commands.executeCommand("setContext", "bm.isBookmarkedLine", exists);
      contextUpdateTimeout = null;
    }, CONTEXT_THROTTLE_MS);
  }

  let activeAnimationInterval = null;
  let activeAnimationResolve = null;
  let tempHighlightDecoration = null;
  let crossFileJumpStatusBarItem = null;

  function updateCrossFileJumpStatusBar() {
    if (!crossFileJumpStatusBarItem) {
      crossFileJumpStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
      crossFileJumpStatusBarItem.command = "bm.toggleCrossFileJump";
    }
    const config = getConfig();
    const allowed = config.allowCrossFileJump !== false;
    if (allowed) {
      crossFileJumpStatusBarItem.text = "$(files) Cross-File Jump: ON";
      crossFileJumpStatusBarItem.tooltip = "Click to disable jumping to bookmarks in other files";
      crossFileJumpStatusBarItem.color = "";
    } else {
      crossFileJumpStatusBarItem.text = "$(files) Cross-File Jump: OFF";
      crossFileJumpStatusBarItem.tooltip = "Click to enable jumping to bookmarks in other files";
      crossFileJumpStatusBarItem.color = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
    crossFileJumpStatusBarItem.show();
  }

  function cancelActiveAnimation() {
    if (activeAnimationInterval) {
      clearInterval(activeAnimationInterval);
      activeAnimationInterval = null;
    }
    if (activeAnimationResolve) {
      activeAnimationResolve();
      activeAnimationResolve = null;
    }
  }

  function flashLineHighlight(editor, line, bookmarkGroup) {
    if (tempHighlightDecoration) {
      tempHighlightDecoration.dispose();
    }
    
    const groups = getGroups();
    const groupColor = groups[bookmarkGroup] || groups[activeGroup] || "#fff59d";
    
    tempHighlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: `${groupColor}44`,
      isWholeLine: true,
      border: `1px solid ${groupColor}`
    });
    
    const range = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0));
    editor.setDecorations(tempHighlightDecoration, [range]);
    
    const fileName = path.basename(editor.document.uri.fsPath);
    vscode.window.setStatusBarMessage(`📁 Jumped to ${fileName} (Line ${line + 1})`, 2500);
    
    setTimeout(() => {
      if (tempHighlightDecoration) {
        tempHighlightDecoration.dispose();
        tempHighlightDecoration = null;
      }
    }, 800);
  }

  async function revealRangeWithAnimation(editor, targetLine, isSameFile, bookmarkGroup) {
    cancelActiveAnimation();
    
    const config = getConfig();
    const scrollAnimSetting = config.scrollAnimation || "all";
    
    let useAnimation = false;
    if (scrollAnimSetting === "all") {
      useAnimation = true;
    } else if (scrollAnimSetting === "sameFileOnly") {
      useAnimation = isSameFile;
    }
    
    // If it's a different file, jump instantly and trigger the flash notification if enabled
    if (!isSameFile) {
      const pos = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      if (config.flashHighlight !== false) {
        flashLineHighlight(editor, targetLine, bookmarkGroup);
      }
      return;
    }
    
    if (!useAnimation) {
      const pos = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      if (config.flashHighlight !== false) {
        flashLineHighlight(editor, targetLine, bookmarkGroup);
      }
      return;
    }
    
    const currentLine = editor.selection.active.line;
    if (currentLine === targetLine) {
      const pos = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      if (config.flashHighlight !== false) {
        flashLineHighlight(editor, targetLine, bookmarkGroup);
      }
      return;
    }
    
    const diff = targetLine - currentLine;
    const absDiff = Math.abs(diff);
    
    if (absDiff <= 2) {
      const pos = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      if (config.flashHighlight !== false) {
        flashLineHighlight(editor, targetLine, bookmarkGroup);
      }
      return;
    }
    
    const stepsCount = Math.min(20, Math.max(5, Math.floor(absDiff / 3)));
    const stepDelay = 15; // ms
    let currentStep = 0;
    
    return new Promise((resolve) => {
      activeAnimationResolve = resolve;
      
      activeAnimationInterval = setInterval(() => {
        currentStep++;
        if (currentStep >= stepsCount) {
          cancelActiveAnimation();
          const pos = new vscode.Position(targetLine, 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
          if (config.flashHighlight !== false) {
            flashLineHighlight(editor, targetLine, bookmarkGroup);
          }
        } else {
          const t = currentStep / stepsCount;
          const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          const interpLine = Math.round(currentLine + diff * easeT);
          
          const pos = new vscode.Position(interpLine, 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }
      }, stepDelay);
    });
  }

  let treeRefreshTimeout;
  const TREE_REFRESH_THROTTLE_MS = 100;
  
  function throttledRefreshTrees() {
    if (treeRefreshTimeout) {
      clearTimeout(treeRefreshTimeout);
    }
    treeRefreshTimeout = setTimeout(() => {
      groupsProv.refresh();
      bookmarksProv.refresh();
      treeRefreshTimeout = null;
    }, TREE_REFRESH_THROTTLE_MS);
  }  // --- Optimized Tree Items (lazy loading) ---
  class GroupItem extends vscode.TreeItem {
    constructor(name, isActive, color) {
      super(
        isActive ? `${name} ⭐` : name,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      this.group = name;
      this.id = `group-${name}`;
      this.contextValue = "bookmarkGroupItem";
      this.iconPath = makeIconUri(color);
      this.tooltip = isActive ? `${name} (Active Group)` : `${name} (Click to view bookmarks)`;
    }
  }

  class BookmarkItem extends vscode.TreeItem {
    constructor(bookmark, color, viewId = "groups") {
      const u = vscode.Uri.parse(bookmark.uri);
      const fileName = path.basename(u.fsPath);
      super(
        `${fileName}:${bookmark.line + 1} ${bookmark.content}`,
        vscode.TreeItemCollapsibleState.None
      );
      this.bookmark = bookmark;
      this.id = `bm-${viewId}-${bookmark.group}-${bookmark.uri}-${bookmark.line}`;
      this.contextValue = "bookmarkItem";
      this.tooltip = `${u.fsPath} (Line ${bookmark.line + 1})`;
      this.iconPath = makeIconUri(color);
      this.command = {
        command: "bm.openBookmark",
        title: "Open Bookmark",
        arguments: [this]
      };
    }
  }

  // --- Optimized TreeDataProviders ---
  class GroupsProvider {
    constructor() {
      this._onDidChange = new vscode.EventEmitter();
      this.onDidChangeTreeData = this._onDidChange.event;
      this.dragMimeTypes = ["application/vnd.code.tree.bookmarkgroupsview"];
      this.dropMimeTypes = ["application/vnd.code.tree.bookmarkgroupsview", "application/vnd.code.tree.bookmarksview"];
    }
    
    refresh() {
      this._onDidChange.fire();
    }
    
    getTreeItem(item) {
      return item;
    }
    
    getParent(element) {
      if (element instanceof BookmarkItem) {
        const groups = getGroups();
        const groupColor = groups[element.bookmark.group];
        return new GroupItem(element.bookmark.group, element.bookmark.group === activeGroup, groupColor);
      }
      return null;
    }
    
    getChildren(item) {
      if (!item) {
        const groups = getGroups();
        const order = getGroupOrder();
        return Promise.resolve(
          order.map(g => new GroupItem(g, g === activeGroup, groups[g]))
        );
      }
      
      const groups = getGroups();
      const groupColor = groups[item.group];
      const bookmarks = getBookmarks().filter(b => b.group === item.group);
      return Promise.resolve(bookmarks.map(b => new BookmarkItem(b, groupColor)));
    }
    
    handleDrag(source, data) {
      console.log(`[GroupsProvider Drag] Starting drag. Source elements count: ${source.length}`);
      source.forEach((el, i) => {
        if (el instanceof GroupItem) {
          console.log(`  Element ${i}: GroupItem "${el.group}"`);
        } else if (el instanceof BookmarkItem) {
          console.log(`  Element ${i}: BookmarkItem "${el.bookmark.content}" at line ${el.bookmark.line} in group "${el.bookmark.group}"`);
        }
      });
      data.set("application/vnd.code.tree.bookmarkgroupsview", 
        new vscode.DataTransferItem(source));
    }
    
    async handleDrop(target, data) {
      console.log(`[GroupsProvider Drop] Received drop. Target type: ${target ? target.constructor.name : "root"}`);
      if (target instanceof GroupItem) {
        console.log(`  Target: GroupItem "${target.group}"`);
      } else if (target instanceof BookmarkItem) {
        console.log(`  Target: BookmarkItem "${target.bookmark.content}" at line ${target.bookmark.line} in group "${target.bookmark.group}"`);
      }
      
      const transfer = data.get("application/vnd.code.tree.bookmarkgroupsview") || 
                       data.get("application/vnd.code.tree.bookmarksview");
      if (!transfer) {
        console.log(`[GroupsProvider Drop] No valid transfer data found matching expected MIME types.`);
        return;
      }
      
      const elements = transfer.value;
      if (!Array.isArray(elements) || !elements.length) {
        console.log(`[GroupsProvider Drop] Transfer data has empty or invalid value.`);
        return;
      }
      const element = elements[0];
      
      // Case 1: Dragging a GroupItem (Reordering groups)
      if (element instanceof GroupItem) {
        console.log(`[GroupsProvider Drop] Dragged item is GroupItem "${element.group}". Reordering...`);
        const draggedGroupName = element.group;
        const order = getGroupOrder();
        
        const draggedIdx = order.indexOf(draggedGroupName);
        if (draggedIdx >= 0) {
          order.splice(draggedIdx, 1);
        }
        
        if (target instanceof GroupItem) {
          const targetIdx = order.indexOf(target.group);
          if (targetIdx >= 0) {
            order.splice(targetIdx, 0, draggedGroupName);
          } else {
            order.push(draggedGroupName);
          }
        } else {
          order.push(draggedGroupName);
        }
        
        await saveGroupOrder(order);
        this.refresh();
        return;
      }
      
      // Case 2: Dragging a BookmarkItem (Reordering bookmarks or moving to another group)
      if (element instanceof BookmarkItem) {
        console.log(`[GroupsProvider Drop] Dragged item is BookmarkItem "${element.bookmark.content}". Reordering or moving...`);
        const bookmark = element.bookmark;
        const all = getBookmarks();
        
        const draggedIdx = all.findIndex(b =>
          b.uri === bookmark.uri && b.line === bookmark.line && b.group === bookmark.group
        );
        if (draggedIdx < 0) {
          console.log(`[GroupsProvider Drop] Could not find the dragged bookmark in local store.`);
          return;
        }
        
        const draggedBm = all[draggedIdx];
        
        if (target instanceof GroupItem) {
          console.log(`[GroupsProvider Drop] Dropped on GroupItem "${target.group}". Moving bookmark...`);
          all.splice(draggedIdx, 1);
          if (draggedBm.group !== target.group) {
            draggedBm.group = target.group;
            all.push(draggedBm);
            await saveBookmarks(all);
            this.refresh();
            bookmarksProv.refresh();
            throttledUpdateAllDecorations();
            vscode.window.showInformationMessage(`Bookmark moved to group: ${target.group}`);
          } else {
            all.push(draggedBm);
            await saveBookmarks(all);
            this.refresh();
            bookmarksProv.refresh();
            throttledUpdateAllDecorations();
            vscode.window.showInformationMessage(`Bookmark moved to end of group`);
          }
        } else if (target instanceof BookmarkItem) {
          console.log(`[GroupsProvider Drop] Dropped on BookmarkItem "${target.bookmark.content}". Reordering within group...`);
          const targetIdx = all.findIndex(b =>
            b.uri === target.bookmark.uri && b.line === target.bookmark.line && b.group === target.bookmark.group
          );
          
          if (targetIdx >= 0) {
            all.splice(draggedIdx, 1);
            
            if (draggedBm.group !== target.bookmark.group) {
              draggedBm.group = target.bookmark.group;
            }
            
            let newTargetIdx = all.findIndex(b =>
              b.uri === target.bookmark.uri && b.line === target.bookmark.line && b.group === target.bookmark.group
            );
            if (newTargetIdx < 0) newTargetIdx = targetIdx;
            
            all.splice(newTargetIdx, 0, draggedBm);
            
            await saveBookmarks(all);
            this.refresh();
            bookmarksProv.refresh();
            throttledUpdateAllDecorations();
            vscode.window.showInformationMessage("Bookmark reordered");
          }
        } else {
          console.log(`[GroupsProvider Drop] Dropped on empty space/root. Moving bookmark to activeGroup "${activeGroup}"...`);
          if (draggedBm.group !== activeGroup) {
            draggedBm.group = activeGroup;
            all.splice(draggedIdx, 1);
            all.push(draggedBm);
            await saveBookmarks(all);
            this.refresh();
            bookmarksProv.refresh();
            throttledUpdateAllDecorations();
            vscode.window.showInformationMessage(`Bookmark moved to active group: ${activeGroup}`);
          }
        }
      }
    }
  }

  class BookmarksProvider {
    constructor() {
      this._onDidChange = new vscode.EventEmitter();
      this.onDidChangeTreeData = this._onDidChange.event;
      this.dragMimeTypes = ["application/vnd.code.tree.bookmarksview"];
      this.dropMimeTypes = ["application/vnd.code.tree.bookmarkgroupsview"];
    }
    
    refresh() {
      this._onDidChange.fire();
    }
    
    getTreeItem(item) {
      return item;
    }
    
    getParent(element) {
      if (element instanceof BookmarkItem) {
        const u = vscode.Uri.parse(element.bookmark.uri);
        const fileName = path.basename(u.fsPath);
        const fileItem = new vscode.TreeItem(fileName, vscode.TreeItemCollapsibleState.Collapsed);
        fileItem.id = `file-${fileName}`;
        return fileItem;
      }
      return null;
    }
    
    getChildren(item) {
      if (!item) {
        // Optimized grouping
        const grouped = {};
        const activeBookmarks = getBookmarks().filter(b => b.group === activeGroup);
        
        for (const b of activeBookmarks) {
          const fileName = path.basename(vscode.Uri.parse(b.uri).fsPath);
          if (!grouped[fileName]) grouped[fileName] = [];
          grouped[fileName].push(b);
        }
        
        return Promise.resolve(
          Object.entries(grouped).map(([file, bms]) => {
            const fileItem = new vscode.TreeItem(file, vscode.TreeItemCollapsibleState.Collapsed);
            fileItem.id = `file-${file}`;
            fileItem.bookmarks = bms;
            return fileItem;
          })
        );
      }
      
      if (Array.isArray(item.bookmarks)) {
        // Pre-sort for better performance
        const sorted = item.bookmarks.sort((a, b) => a.line - b.line);
        const groups = getGroups();
        return Promise.resolve(sorted.map(b => new BookmarkItem(b, groups[b.group], "bookmarks")));
      }
      
      return Promise.resolve([]);
    }

    handleDrag(source, data) {
      console.log(`[BookmarksProvider Drag] Starting drag. Source elements count: ${source.length}`);
      source.forEach((el, i) => {
        if (el instanceof BookmarkItem) {
          console.log(`  Element ${i}: BookmarkItem "${el.bookmark.content}" at line ${el.bookmark.line}`);
        }
      });
      data.set("application/vnd.code.tree.bookmarksview",
        new vscode.DataTransferItem(source));
    }
    
    async handleDrop(target, data) {
      console.log(`[BookmarksProvider Drop] Received drop.`);
      const transfer = data.get("application/vnd.code.tree.bookmarkgroupsview");
      if (!transfer) {
        console.log(`[BookmarksProvider Drop] No transfer data found from bookmarkgroupsview.`);
        return;
      }
      
      const elements = transfer.value;
      if (Array.isArray(elements) && elements.length) {
        const element = elements[0];
        console.log(`[BookmarksProvider Drop] Dragged item: GroupItem "${element.group}". Changing active group...`);
        if (element instanceof GroupItem) {
          await setActiveGroup(element.group);
          groupsProv.refresh();
          this.refresh();
          viewBookmarks.title = `Bookmarks: ${activeGroup}`;
          throttledUpdateAllDecorations();
          throttledUpdateCursorContext();
          vscode.window.showInformationMessage(`📌 Active group changed to: ${activeGroup}`);
        }
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
    dragMimeTypes: ["application/vnd.code.tree.bookmarkgroupsview"],
    dropMimeTypes: ["application/vnd.code.tree.bookmarkgroupsview", "application/vnd.code.tree.bookmarksview"],
  });

  const viewBookmarks = vscode.window.createTreeView("bookmarksView", {
    treeDataProvider: bookmarksProv,
    dragAndDropController: bookmarksProv,
    dragMimeTypes: ["application/vnd.code.tree.bookmarksview"],
    dropMimeTypes: ["application/vnd.code.tree.bookmarkgroupsview"],
  });
  viewBookmarks.title = `Bookmarks: ${activeGroup}`;

  // --- Optimized Commands ---
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
          const { defaultColors } = getConfig();
          groups["Default"] = defaultColors[0];
          await saveGroups(groups);
        }
        await setActiveGroup(names[0] || "Default");
      }

      const bms = getBookmarks();
      const idx = bms.findIndex(b => 
        b.uri === uri && b.line === line && b.group === activeGroup
      );
      
      if (idx >= 0) {
        bms.splice(idx, 1);
        vscode.window.showInformationMessage("Bookmark removed");
      } else {
        bms.push({ uri, line, content, group: activeGroup });
        vscode.window.showInformationMessage(`Bookmark added to ${activeGroup}`);
      }
      
      await saveBookmarks(bms);
      groupsProv.refresh();
      bookmarksProv.refresh();
      throttledUpdateAllDecorations();
      throttledUpdateCursorContext();
    }),

    vscode.commands.registerCommand("bm.clearBookmarks", async () => {
      const activeBookmarks = getBookmarks().filter(b => b.group === activeGroup);
      if (!activeBookmarks.length) {
        return vscode.window.showInformationMessage("No bookmarks to clear");
      }
      
      const confirm = await vscode.window.showWarningMessage(
        `Clear ${activeBookmarks.length} bookmarks from "${activeGroup}"?`,
        { modal: true }, "Yes"
      );
      if (confirm !== "Yes") return;
      
      const filtered = getBookmarks().filter(b => b.group !== activeGroup);
      await saveBookmarks(filtered);
      groupsProv.refresh();
      bookmarksProv.refresh();
      throttledUpdateAllDecorations();
      throttledUpdateCursorContext();
      vscode.window.showInformationMessage(`Cleared bookmarks from ${activeGroup}`);
    }),

    vscode.commands.registerCommand("bm.openBookmark", async (item) => {
      const bm = item?.bookmark;
      if (!bm) return vscode.window.showInformationMessage("Not a bookmark entry");
      
      try {
        const activeEditor = vscode.window.activeTextEditor;
        const activeUri = activeEditor ? activeEditor.document.uri.toString() : null;
        const isSameFile = (activeUri === bm.uri);

        const config = getConfig();
        if (!isSameFile && config.allowCrossFileJump === false) {
          vscode.window.showWarningMessage("Jumping to another file is disabled.");
          return;
        }

        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(bm.uri));
        const ed = await vscode.window.showTextDocument(doc);
        await revealRangeWithAnimation(ed, bm.line, isSameFile, bm.group);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open bookmark: ${error.message}`);
      }
    }),

    vscode.commands.registerCommand("bm.removeBookmark", async (item) => {
      const bm = item?.bookmark;
      if (!bm) return;
      
      const all = getBookmarks();
      const idx = all.findIndex(b => 
        b.uri === bm.uri && b.line === bm.line && b.group === bm.group
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
      
      const groups = Object.keys(getGroups()).filter(g => g !== bm.group);
      if (!groups.length) {
        return vscode.window.showInformationMessage("No other groups");
      }
      
      const target = await vscode.window.showQuickPick(groups, {
        placeHolder: "Move to which group?",
      });
      if (!target) return;
      
      const all = getBookmarks();
      const idx = all.findIndex(b => 
        b.uri === bm.uri && b.line === bm.line && b.group === bm.group
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
      const name = await vscode.window.showInputBox({ prompt: "New group name" });
      if (!name) return;

      const groups = getGroups();
      if (groups[name]) {
        return vscode.window.showWarningMessage("Group already exists");
      }

      const color = hslToHex(Math.random() * 360, 70, 80);
      groups[name] = color;
      await saveGroups(groups);

      const order = getGroupOrder();
      if (!order.includes(name)) {
        order.push(name);
        await saveGroupOrder(order);
      }

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
        prompt: `Rename "${old}" to:`, value: old
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

      const order = getGroupOrder();
      const oIdx = order.indexOf(old);
      if (oIdx >= 0) {
        order[oIdx] = newName;
        await saveGroupOrder(order);
      }
      
      const bms = getBookmarks().map(b => 
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
      
      const count = getBookmarks().filter(b => b.group === name).length;
      const confirm = await vscode.window.showWarningMessage(
        `Delete "${name}" and ${count} bookmarks?`,
        { modal: true }, "Yes"
      );
      if (confirm !== "Yes") return;
      
      const groups = getGroups();
      delete groups[name];
      await saveGroups(groups);

      const order = getGroupOrder();
      const idx = order.indexOf(name);
      if (idx >= 0) {
        order.splice(idx, 1);
        await saveGroupOrder(order);
      }
      
      const remaining = getBookmarks().filter(b => b.group !== name);
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
          
          const newOrder = getGroupOrder();
          if (!newOrder.includes("Default")) {
            newOrder.push("Default");
            await saveGroupOrder(newOrder);
          }

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
      
      const config = getConfig();
      const currentUri = editor.document.uri.toString();
      let bookmarksList = getBookmarks().filter(b => b.group === activeGroup);
      
      if (config.allowCrossFileJump === false) {
        bookmarksList = bookmarksList.filter(b => b.uri === currentUri);
      }
      
      const sorted = bookmarksList.sort((a, b) => a.uri !== b.uri ? a.uri.localeCompare(b.uri) : a.line - b.line);
      if (!sorted.length) return;
      
      const currentLine = editor.selection.active.line;
      let idx = sorted.findIndex(b => b.uri === currentUri && b.line === currentLine);
      idx = (idx + 1) % sorted.length;
      
      const nextBm = sorted[idx];
      try {
        const isSameFile = (currentUri === nextBm.uri);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(nextBm.uri));
        const ed = await vscode.window.showTextDocument(doc);
        await revealRangeWithAnimation(ed, nextBm.line, isSameFile, nextBm.group);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open bookmark: ${error.message}`);
      }
    }),

    vscode.commands.registerCommand("bm.prevBookmark", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      
      const config = getConfig();
      const currentUri = editor.document.uri.toString();
      let bookmarksList = getBookmarks().filter(b => b.group === activeGroup);
      
      if (config.allowCrossFileJump === false) {
        bookmarksList = bookmarksList.filter(b => b.uri === currentUri);
      }
      
      const sorted = bookmarksList.sort((a, b) => a.uri !== b.uri ? a.uri.localeCompare(b.uri) : a.line - b.line);
      if (!sorted.length) return;
      
      const currentLine = editor.selection.active.line;
      let idx = sorted.findIndex(b => b.uri === currentUri && b.line === currentLine);
      idx = (idx - 1 + sorted.length) % sorted.length;
      
      const prevBm = sorted[idx];
      try {
        const isSameFile = (currentUri === prevBm.uri);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(prevBm.uri));
        const ed = await vscode.window.showTextDocument(doc);
        await revealRangeWithAnimation(ed, prevBm.line, isSameFile, prevBm.group);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open bookmark: ${error.message}`);
      }
    }),

    vscode.commands.registerCommand("bm.refreshDecorationsFromConfig", async () => {
      await applyConfigChanges();
      vscode.window.showInformationMessage("Bookmark styles refreshed from config.");
    }),
    
    vscode.commands.registerCommand("bm.moveBookmarkUp", async (node) => {
      if (!node || !node.bookmark) return;
      const all = getBookmarks();
      const idx = all.findIndex(b => b.uri === node.bookmark.uri && b.line === node.bookmark.line && b.group === node.bookmark.group);
      if (idx > 0) {
        // Swap with the previous bookmark in the same group
        let prevIdx = idx - 1;
        while (prevIdx >= 0 && all[prevIdx].group !== node.bookmark.group) {
          prevIdx--;
        }
        if (prevIdx >= 0) {
          const temp = all[idx];
          all[idx] = all[prevIdx];
          all[prevIdx] = temp;
          await saveBookmarks(all);
          groupsProv.refresh();
          bookmarksProv.refresh();
        }
      }
    }),
    
    vscode.commands.registerCommand("bm.moveBookmarkDown", async (node) => {
      if (!node || !node.bookmark) return;
      const all = getBookmarks();
      const idx = all.findIndex(b => b.uri === node.bookmark.uri && b.line === node.bookmark.line && b.group === node.bookmark.group);
      if (idx >= 0 && idx < all.length - 1) {
        // Swap with the next bookmark in the same group
        let nextIdx = idx + 1;
        while (nextIdx < all.length && all[nextIdx].group !== node.bookmark.group) {
          nextIdx++;
        }
        if (nextIdx < all.length) {
          const temp = all[idx];
          all[idx] = all[nextIdx];
          all[nextIdx] = temp;
          await saveBookmarks(all);
          groupsProv.refresh();
          bookmarksProv.refresh();
        }
      }
    }),

    vscode.commands.registerCommand("bm.toggleCrossFileJump", async () => {
      const config = vscode.workspace.getConfiguration("bookmarkExtension");
      const allowed = config.get("allowCrossFileJump", true);
      await config.update("allowCrossFileJump", !allowed, vscode.ConfigurationTarget.Global);
      updateCrossFileJumpStatusBar();
      vscode.window.showInformationMessage(`Cross-file jumping is now ${!allowed ? "enabled" : "disabled"}.`);
    }),

    // Optimized configuration change handler
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("bookmarkExtension.groupColors") ||
          e.affectsConfiguration("bookmarkExtension.defaultColors") ||
          e.affectsConfiguration("bookmarkExtension.opacity") ||
          e.affectsConfiguration("bookmarkExtension.scrollAnimation") ||
          e.affectsConfiguration("bookmarkExtension.flashHighlight") ||
          e.affectsConfiguration("bookmarkExtension.allowCrossFileJump")) {
        await applyConfigChanges();
        updateCrossFileJumpStatusBar();
        vscode.window.showInformationMessage("🔧 Bookmark Extension settings have been applied.");
      }
    }),

    // Optimized document change handler with debouncing and edge-case handling
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const changes = event.contentChanges;
      const doc = event.document;
      const docUri = doc.uri.toString();
      if (!changes.length) return;
      
      let bms = getBookmarks();
      let hasChanges = false;
      
      // 1. Adjust the line numbers of bookmarks based on line insertions/deletions
      for (const change of changes) {
        const startLine = change.range.start.line;
        const endLine = change.range.end.line;
        const oldCount = endLine - startLine + 1;
        const newCount = change.text.split("\n").length;
        const delta = newCount - oldCount;
        
        if (delta !== 0) {
          for (const bm of bms) {
            if (bm.uri === docUri) {
              if (startLine < bm.line) {
                // The change is above the bookmark, so shift it
                bm.line = Math.max(0, bm.line + delta);
                hasChanges = true;
              } else if (startLine <= bm.line && bm.line <= endLine) {
                // The change directly overlaps/contains the bookmarked line.
                // Snap bookmark to startLine of deletion/modification range.
                bm.line = startLine;
                hasChanges = true;
              }
            }
          }
        }
      }
      
      // 2. Validate all bookmarks for this document (e.g. content updates, duplicate checks, boundary checks)
      const lineCount = doc.lineCount;
      const validBms = [];
      
      for (const bm of bms) {
        if (bm.uri === docUri) {
          if (bm.line < lineCount) {
            const currentText = doc.lineAt(bm.line).text.trim();
            if (bm.content !== currentText) {
              bm.content = currentText;
              hasChanges = true;
            }
            // Check if we already have a bookmark on this line in this group (to avoid duplicates)
            const isDuplicate = validBms.some(existing => 
              existing.uri === bm.uri && existing.line === bm.line && existing.group === bm.group
            );
            if (!isDuplicate) {
              validBms.push(bm);
            } else {
              hasChanges = true;
            }
          } else {
            // Out of bounds, remove bookmark
            hasChanges = true;
          }
        } else {
          validBms.push(bm);
        }
      }
      
      if (hasChanges) {
        await saveBookmarks(validBms);
        throttledRefreshTrees();
        throttledUpdateAllDecorations();
        throttledUpdateCursorContext();
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
  updateCrossFileJumpStatusBar();
  
  // Cleanup function for timeouts
  context.subscriptions.push({
    dispose: () => {
      if (crossFileJumpStatusBarItem) {
        crossFileJumpStatusBarItem.dispose();
      }
      if (decorationUpdateTimeout) {
        clearTimeout(decorationUpdateTimeout);
      }
      if (contextUpdateTimeout) {
        clearTimeout(contextUpdateTimeout);
      }
      if (activeAnimationInterval) {
        clearInterval(activeAnimationInterval);
      }
      if (treeRefreshTimeout) {
        clearTimeout(treeRefreshTimeout);
      }
      if (tempHighlightDecoration) {
        tempHighlightDecoration.dispose();
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
    }
  });
}

function deactivate() {}

module.exports = { activate, deactivate };