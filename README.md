# 📚 Smart Bookmarks for VS Code

A powerful and intuitive bookmark extension that helps you navigate your code with ease. Organize bookmarks into groups, create nested sub-groups, customize colors, and jump between important code locations instantly without losing your horizontal scroll position.

## ✨ Features

### 🎯 Core Functionality
- **Quick Bookmarking**: Toggle bookmarks with a simple keyboard shortcut (`Ctrl+Alt+K` / `Cmd+Alt+K`)
- **Line & Scroll Preservation**: Bookmarks automatically adjust when you add/remove lines, and jumping to them preserves your exact horizontal scroll position
- **Content Preview**: See the actual code content in the bookmark list
- **Fast Navigation**: Jump to next/previous bookmarks with `F8`/`Shift+F8`
- **Cross-File Jumping**: Seamlessly jump to bookmarks in different files
- **Global Search**: Search and jump to any bookmark across your entire workspace using the **Show All Bookmarks** command

### 🏷️ Group & Hierarchy Management
- **Multiple Groups**: Organize bookmarks into custom groups (Default, Tests, TODO, etc.)
- **Nested Sub-Groups**: Right-click any group to create nested sub-groups (e.g., `Bugs ❯ Backend`)
- **Send To...**: Right-click any bookmark (in the sidebar or directly in the editor) to instantly move it to another group using a smart quick-pick menu
- **Hide Bookmarks**: Click the inline eye icon `$(eye)` to hide individual bookmarks within a group. This also temporarily disables their highlighting in the editor to keep your code clean!
- **Color-Coded**: Each group gets a unique color for easy visual identification
- **Drag & Drop**: Reorder groups effortlessly in the sidebar
- **Quick Reorder**: Use the inline Move Up (↑) and Move Down (↓) arrows to organize bookmarks within a group

### 🎨 Visual Experience
- **Gutter Icons**: Colored bookmark icons in the editor gutter
- **Line Highlighting**: Subtle background highlighting of bookmarked lines
- **Flash Highlights**: Animate jumps with a visual color flash to catch your attention
- **Customizable Tree UI**: Choose between a minimalist text-only bookmark list or toggle on colored icons for individual bookmarks
- **Tree Views**: Organized sidebar panels for groups and bookmarks

### ⚡ Advanced Tools & Data Portability
- **Export & Import**: Instantly backup your entire bookmark ecosystem to a JSON file and restore it across devices or workspaces
- **Throttled Updates**: Smooth performance even with many bookmarks
- **Cached Operations**: Intelligent caching for faster response times

## 🚀 Quick Start

1. **Install** the extension from the VS Code marketplace
2. **Open** any file and place your cursor on a line you want to bookmark
3. **Press** `Ctrl+Alt+K` (or `Cmd+Alt+K` on Mac) to toggle a bookmark
4. **View** your bookmarks in the sidebar under "Bookmarks" and "Bookmark Groups"
5. **Navigate** between bookmarks using `F8` (next) and `Shift+F8` (previous)

## 📋 Commands

| Command | Keyboard Shortcut | Description |
|---------|------------------|-------------|
| `BM: Toggle Bookmark` | `Ctrl+Alt+K` / `Cmd+Alt+K` | Add or remove bookmark on current line |
| `BM: Next Bookmark` | `F8` | Jump to next bookmark in active group |
| `BM: Previous Bookmark` | `Shift+F8` | Jump to previous bookmark in active group |
| `BM: Show All Bookmarks` | - | Search and jump to any bookmark via QuickPick |
| `BM: Clear All Bookmarks` | - | Remove all bookmarks from active group |
| `BM: Create Group` | - | Create a new bookmark group |
| `BM: Toggle Cross-File Jump` | - | Allow or block `F8` jumps to different files |

## 🎛️ Configuration

Customize the extension through VS Code settings:

```json
{
  "bookmarkExtension.groupColors": {
    "Default": "#fff59d",
    "Tests": "#aed581",
    "TODO": "#ba68c8"
  },
  "bookmarkExtension.defaultColors": [
    "#fff59d",
    "#aed581", 
    "#ba68c8"
  ],
  "bookmarkExtension.opacity": 0.3,
  "bookmarkExtension.flashHighlight": true,
  "bookmarkExtension.scrollAnimation": "all",
  "bookmarkExtension.allowCrossFileJump": true,
  "bookmarkExtension.showBookmarkIconInTree": false,
  "bookmarkExtension.showHideBookmarksActionInline": true
}
```

### Settings Explained

- **`groupColors`**: Override colors for specific groups (hex format)
- **`defaultColors`**: Fallback colors for new groups
- **`opacity`**: Background highlight opacity (0-1, where 0 is transparent)
- **`flashHighlight`**: Briefly flash the bookmark color when jumping to it
- **`scrollAnimation`**: Control smooth scrolling (`all`, `sameFileOnly`, `none`)
- **`allowCrossFileJump`**: Let `F8` jump across files instead of wrapping inside the current file
- **`showBookmarkIconInTree`**: Toggle colored bookmark icons next to individual entries in the sidebar views
- **`showHideBookmarksActionInline`**: Controls whether the "Hide Bookmarks" eye icon appears inline (true) or in the context menu (false)

## 🖱️ Using the Interface

### Sidebar Views

**Bookmark Groups Panel:**
- View all your bookmark groups and sub-groups
- Active group is marked with a bullet point
- Click any group to switch to it
- Hover over a group to hide/unhide its bookmarks using the eye icon
- Export/Import buttons are located at the top of the panel

**Bookmarks Panel:**
- Shows bookmarks from the active group
- Click any bookmark to jump to that location

### Context Menus

**Right-click in Text Editor:**
- `BM: Send To...` instantly moves the bookmarked line your cursor is on to another group

**Right-click on bookmarks in Sidebar:**
- `Open Bookmark`
- `BM: Send To...`
- `Remove Bookmark`

**Right-click on groups in Sidebar:**
- `Set Active Group`
- `Create Sub-group`
- `Rename Group`
- `Delete Group` (recursively deletes all sub-groups and their bookmarks)

## 💡 Usage Tips

### Workflow Suggestions

1. **Create Semantic Groups**: Use groups like "TODO", "Bugs", "Important", "Review"
2. **Build Hierarchies**: Use sub-groups like `Bugs ❯ Backend ❯ Critical`
3. **Color Coordination**: Match group colors to your workflow (red for bugs, yellow for TODO)
4. **Regular Cleanup**: Use "Clear All Bookmarks" to clean up completed tasks

## 🐛 Troubleshooting

### Common Issues

**Bookmarks not showing?**
- Make sure you haven't clicked the "Hide Bookmarks" eye icon for that group.
- Ensure you have an active group selected.

**Performance issues?**
- The extension uses throttling to maintain performance. If issues persist, try restarting VS Code.
