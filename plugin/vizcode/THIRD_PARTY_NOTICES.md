# Third-party notices

VizCode's original contributions are copyright (c) 2026 Pui Chin Li and other
contributors, under GPL-3.0-or-later. Dependencies keep their own licenses and
copyrights. The main GPL license does not relicense third-party code.

Full license texts and version-specific copyright notices are retained in
`licenses/`. Generated `widget.js.LICENSE.txt` supplements those texts.

## Visualizer and Python tracer

The source snapshot comes from dive4dec/OPT_Mentor at
`62ee7e7fa2e7260626a9a4de2086f1d5b84590c9`. Its `optmentorwidgets/LICENSE` contains
an MIT grant attributed to dive4dec (2022); `optmentorwidgets/LICENSE.txt` contains
Chung Chan's BSD-3-Clause notice (2022). Both are retained. The Python tracer
`pg_logger.py` and `pg_encoder.py` contain explicit MIT grants by Philip J. Guo;
OPT_Mentor's wrapper contributions carry their own retained notices.

The tracer/visualizer source is under `optlite-webllm/optlite-components`.
Original Python Tutor copyright headers and references are retained in source.
The separately retained historical Python Tutor MIT notice is attributed to
Philip J. Guo; fork contributions retain their own notices.

## Browser libraries

- CodeMirror, Lezer and their supporting modules: MIT; exact versions/texts in
  `licenses/npm/` and the inventory.
- D3 3.5.17: BSD-3-Clause; Mike Bostock's copyright and text retained.
- Lucide 0.468.0: ISC with retained Feather/MIT attribution in its license.
- jQuery 3.0.0 and jQuery UI 1.11.4 (including themes/assets): MIT. The embedded
  jQuery Color notice and other copyright headers are retained in source and the
  generated bundle. MIT's full text is retained alongside those notices.
- jQuery BBQ 1.3pre and doTimeout: copyright (c) 2010 Ben Alman; the MIT option of
  their inline MIT/GPL dual-license notice is selected. Inherited BBQ changes
  preserve their source notices.
- jsPlumb 1.3.10: copyright (c) 2010–2012 Simon Porritt. The vendored minified file
  exactly matches commit `81116f11c4bc6092959156b0289ef66dc26774fa`. Its matching
  unminified release header offers MIT or GPL2; the MIT option is selected.
  `jsplumb-1.3.10-source-notice.txt` retains that header; `MIT-standard.txt` supplies
  the canonical MIT text from SPDX license-list-data v3.27.0.
- CSS/style loader runtime helpers are emitted into the browser bundle even
  though npm marks the packages as development dependencies. Their MIT notices
  are included. The generated inventory distinguishes these from build-only tools.

## Python execution runtime

Pyodide 314.0.2 is MPL-2.0. Its full version-specific license is retained, along
with CPython 3.14.2's complete license history. Their source locations are
https://github.com/pyodide/pyodide/tree/314.0.2 and
https://github.com/python/cpython/tree/v3.14.2 . Component license texts for libffi, hiwire, xz, Zstandard, zlib, bzip2,
stackframe and Emscripten are retained alongside the parent runtime licenses.
Each text applies to its respective component. No additional Python registry
packages are shipped.

## Native debugging tools

The C++ adapter uses GCC/G++, GDB and the system C++ runtime installed by its
Docker build recipe. It does not ship a browser compiler or LLVM/WASI runtime.
Installed packages retain their upstream copyright and license files in the
image, including `/usr/share/doc/*/copyright`. The optional DAP example installs
Microsoft debugpy 1.8.17 (MIT) in its isolated image; its installed distribution
retains its notices. Source: https://github.com/microsoft/debugpy/tree/v1.8.17 .

## Moodle integration and server builds

CodeRunner commit `95470d84ac21d020a261e3d4220a5033ef1b17bc` and adaptive behaviour
commit `c7d4df35ff3c12731a81458f64a74667d367cf69` carry GPL-3.0-or-later notices.
These include attribution to Richard Lobb, The Open University, the University
of Canterbury and their contributors. The version-checked bridge preserves
upstream headers. Original Java tracing/supervision code is GPL-3.0-or-later.

The release supplies Docker build recipes, not prebuilt images. Administrators'
builds download OS packages and Jobe; their upstream licenses apply separately.
Those builds must retain installed notices (including `/usr/share/doc/*/copyright`)
and relevant OpenJDK, Node, Docker CLI, GCC/runtime, PHP/Apache and OS distribution
notices. Jobe, its CodeIgniter dependencies and DOMjudge runguard require their
own image-level inventory before an image is exported or published. The current
release workflow does not distribute these images.

No branding or trademark rights are granted by these license notices.
