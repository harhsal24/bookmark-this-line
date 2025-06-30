# 📚 Smart Bookmarks for VS Code

A powerful and intuitive bookmark extension that helps you navigate your code with ease. Organize bookmarks into groups, customize colors, and jump between important code locations instantly.

## ✨ Features

### 🎯 Core Functionality
- **Quick Bookmarking**: Toggle bookmarks with a simple keyboard shortcut (`Ctrl+Alt+K` / `Cmd+Alt+K`)
- **Line Preservation**: Bookmarks automatically adjust when you add/remove lines
- **Content Preview**: See the actual code content in the bookmark list
- **Fast Navigation**: Jump to next/previous bookmarks with `F8`/`Shift+F8`

### 🏷️ Group Management
- **Multiple Groups**: Organize bookmarks into custom groups (Default, Tests, TODO, etc.)
- **Color-Coded**: Each group gets a unique color for easy visual identification
- **Active Group**: Work with one group at a time to stay focused
- **Drag & Drop**: Move bookmarks between groups effortlessly

### 🎨 Visual Experience
- **Gutter Icons**: Colored bookmark icons in the editor gutter
- **Line Highlighting**: Subtle background highlighting of bookmarked lines
- **Customizable**: Adjust colors and opacity to match your theme
- **Tree Views**: Organized sidebar panels for groups and bookmarks

### ⚡ Performance Optimized
- **Throttled Updates**: Smooth performance even with many bookmarks
- **Cached Operations**: Intelligent caching for faster response times
- **Batch Processing**: Efficient handling of multiple operations

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
| `BM: Clear All Bookmarks` | - | Remove all bookmarks from active group |
| `BM: Create Group` | - | Create a new bookmark group |

## 🎛️ Configuration

Customize the extension through VS Code settings:

```json
{
  "bookmarkExtension.groupColors": {
    "Default": "#fff59d",
    "Tests": "#aed581",
    "TODO": "#ba68c8",
    "Important": "#4fc3f7"
  },
  "bookmarkExtension.defaultColors": [
    "#fff59d",
    "#aed581", 
    "#ba68c8",
    "#4fc3f7"
  ],
  "bookmarkExtension.opacity": 0.3
}
```

### Settings Explained

- **`groupColors`**: Override colors for specific groups (hex format)
- **`defaultColors`**: Fallback colors for new groups
- **`opacity`**: Background highlight opacity (0-1, where 0 is transparent)

## 🖱️ Using the Interface

### Sidebar Views

**Bookmark Groups Panel:**
- View all your bookmark groups
- Active group is marked with a ⭐ star
- Click any group to switch to it
- Right-click for group management options

**Bookmarks Panel:**
- Shows bookmarks from the active group
- Organized by file for easy navigation
- Click any bookmark to jump to that location
- Drag bookmarks between groups

### Context Menus

**Right-click on bookmarks** for options like:
- Remove bookmark
- Move to different group

**Right-click on groups** for options like:
- Set as active group
- Rename group
- Delete group (and all its bookmarks)

## 💡 Usage Tips

### Workflow Suggestions

1. **Create Semantic Groups**: Use groups like "TODO", "Bugs", "Important", "Review"
2. **Color Coordination**: Match group colors to your workflow (red for bugs, yellow for TODO)
3. **Regular Cleanup**: Use "Clear All Bookmarks" to clean up completed tasks
4. **File Organization**: Bookmarks are grouped by filename for easy navigation

### Best Practices

- **Meaningful Content**: Bookmark lines with descriptive code/comments
- **Group by Purpose**: Separate temporary bookmarks from permanent ones
- **Use Keyboard Shortcuts**: Master `F8`/`Shift+F8` for quick navigation
- **Customize Colors**: Set up colors that work well with your theme

## 🔧 Advanced Features

### Drag and Drop
- Drag bookmarks between groups in the sidebar
- Visual feedback during drag operations
- Automatic refresh of all views

### Auto Line Adjustment
- Bookmarks automatically move when you insert/delete lines
- Smart handling of complex text changes
- Preserves bookmark relevance as code evolves

### Multi-File Support
- Bookmarks work across all file types
- Cross-project bookmark management
- Persistent storage across VS Code sessions

## 🎯 Use Cases

### Development Workflows
- **Code Review**: Mark lines that need review or discussion
- **Debugging**: Track important breakpoint locations and debug points
- **TODO Management**: Keep track of tasks and improvements needed
- **Learning**: Bookmark important code patterns while studying codebases

### Team Collaboration
- **Code Tours**: Create bookmark groups for different areas of the codebase
- **Documentation**: Mark important sections for team reference
- **Refactoring**: Track areas that need refactoring attention

## 🐛 Troubleshooting

### Common Issues

**Bookmarks not showing?**
- Make sure you have an active group selected
- Check that bookmarks are in the correct group
- Try refreshing the sidebar views

**Performance issues?**
- The extension uses throttling to maintain performance
- Large numbers of bookmarks are handled efficiently
- If issues persist, try restarting VS Code

**Colors not updating?**
- Settings changes apply automatically
- Use the "Refresh Decorations" command if needed
- Ensure color values are valid hex codes

### Getting Help

If you encounter issues:
1. Check the VS Code Developer Console for errors
2. Try disabling/re-enabling the extension
3. Report issues with steps to reproduce

## 🤝 Contributing

We welcome contributions! Whether it's:
- 🐛 Bug reports
- 💡 Feature suggestions  
- 📝 Documentation improvements
- 🔧 Code contributions

## 📄 License

This extension is released under the MIT License.

## 🙏 Acknowledgments

Built with ❤️ for the VS Code community. Thanks to all users who provide feedback and help improve the extension!

---

**Enjoy your enhanced coding experience with Smart Bookmarks!** 🚀