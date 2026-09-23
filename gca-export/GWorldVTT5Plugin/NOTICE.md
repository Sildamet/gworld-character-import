# Third-party source

The files in this directory (`ExportToFoundryVTT.vb`, `AssemblyInfo.vb`, `compile.xml`) are vendored, unmodified,
from the [`crnormand/gurps`](https://github.com/crnormand/gurps) Foundry VTT system repository, from
`exportutils/ExportToFoundryVTT/`. That repository is MIT-licensed (see below), with no separate license for this
subdirectory, so this reuse is covered by the same terms.

They are GCA5-native plugin *source* — GCA5 compiles plugins itself at startup from files placed under its
`plugins\` folder (see `../README.md`), so there is no build step here and nothing to keep in sync beyond this copy.

This plugin's exported XML shape is `crnormand/gurps`'s own internal tool, tuned for that system's data model, not a
stable public interchange format. `gworld-character-import`'s parser is written against the shape emitted by
*this exact vendored copy* (root `version="GCA5-14"`); it is not automatically kept in sync with any future changes
upstream.

```
MIT License

Copyright (c) 2020 Foundry Network

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
