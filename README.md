# GLB Animation Editor

A standalone, browser-based skeletal animation editor for GLB/GLTF files. Create, edit, and export animations with ease.

![GLB Animation Editor](https://img.shields.io/badge/Three.js-r159-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **🎯 Drag & Drop GLB/GLTF Loading** - Simply drag your 3D model into the editor
- **🦴 Bone Manipulation** - Select and transform bones with intuitive controls
- **🔑 Keyframe Animation** - Create keyframe-based animations with timeline scrubbing
- **📦 GLB Export** - Export your animations back to GLB format
- **📤 JSON Export/Import** - Save and load animation data as JSON
- **↩️ Undo/Redo** - Full history support for all operations
- **🎮 Playback Controls** - Preview animations with adjustable speed and looping
- **📋 Copy/Paste/Mirror** - Efficiently pose bones with copy/paste and L↔R mirroring

## Getting Started

### Quick Start

1. **Clone or download this project**

2. **Install dependencies** (optional, for local server):
   ```bash
   npm install
   ```

3. **Run the editor**:
   ```bash
   npm start
   ```
   
   Or simply open `index.html` in a modern browser (some features may require a local server due to CORS).

4. **Load a GLB file** by dragging it onto the drop zone or clicking to browse.

### Using the Editor

#### Loading Models
- Drag & drop any `.glb` or `.gltf` file onto the welcome screen
- Or click "Load Sample Model" to experiment with a demo skeleton

#### Selecting Bones
- Use the **Bone Hierarchy** panel (left) to select bones by name
- Use **Quick Select** buttons for common bones
- Click bones directly in the viewport when using the Select tool (V)

#### Transforming Bones
- **Rotate (R)** - Default tool for posing
- **Translate (T)** - Move bones
- **Scale (S)** - Scale bones
- **Select (V)** - Click to select bones in viewport

Use the Properties panel (right) to enter precise values or use sliders.

#### Creating Animations

1. **Select a bone** from the hierarchy
2. **Transform it** using the gizmo or property inputs
3. **Add a keyframe** by clicking "Add Keyframe" or pressing **K**
4. **Move to another frame** using the timeline or arrow keys
5. **Repeat** for all bones and frames

#### Timeline Controls
- **⏮ / ⏭** - Previous/Next frame
- **▶** - Play/Pause animation
- **Arrow Keys** - Step through frames
- Click on timeline to jump to any frame

#### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `V` | Select tool |
| `R` | Rotate tool |
| `T` | Translate tool |
| `S` | Scale tool |
| `K` | Add keyframe |
| `Delete` | Delete keyframe |
| `B` | Toggle bone view |
| `←/→` | Previous/Next frame |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |

## Export Options

### Export as GLB
- **Include model mesh** - Export the full model with animation (larger file)
- **Binary GLB format** - Compact binary format (recommended)
- **Optimize keyframes** - Remove redundant data

### Export as JSON
Animation data as JSON for custom use:
```json
{
  "name": "walk_cycle",
  "fps": 24,
  "totalFrames": 30,
  "keyframes": {
    "0": {
      "Hips": {
        "position": [0, 1, 0],
        "rotation": [0, 0, 0, 1],
        "scale": [1, 1, 1]
      }
    }
  }
}
```

## Technical Details

### Dependencies
- [Three.js r159](https://threejs.org/) - 3D rendering
- No build step required - uses ES modules with import maps

### Browser Support
- Chrome 89+
- Firefox 89+
- Safari 15+
- Edge 89+

### File Format Notes
- Supports standard GLTF 2.0 armature/skeleton structures
- Exports animations as standard GLTF animation clips
- Compatible with Blender, Unity, Unreal, and other 3D tools

## Project Structure

```
glb-animation-editor/
├── index.html      # Main HTML file
├── editor.js       # Editor logic (ES module)
├── editor.css      # Styles
├── package.json    # NPM configuration
└── README.md       # This file
```

## Importing into Other Projects

### Blender
1. Export your animation as GLB
2. In Blender: File → Import → glTF 2.0
3. Animation will appear in the Action Editor

### Unity
1. Export as GLB
2. Drag into Unity project
3. Animation clips will be extracted automatically

### Unreal Engine
1. Export as GLB
2. Import using the glTF importer plugin
3. Assign to Animation Blueprint

## Development

### Running Locally
```bash
# Install dev dependencies
npm install

# Start local server
npm run dev
```

### Building for Production
This project uses vanilla JS with no build step. To minify for production:
```bash
# Optional: Minify JS/CSS with your preferred tools
npx terser editor.js -o editor.min.js
npx csso editor.css -o editor.min.css
```

## License

MIT License - Feel free to use in personal and commercial projects.

## Credits

- Three.js team for the excellent 3D library
- GLTFLoader and GLTFExporter from Three.js examples

## Contributing

Contributions welcome! Please open an issue or PR.

---

Made with ❤️ for the 3D animation community

