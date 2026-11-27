# vendor/

## drillbox-0.0.0-40f9b05.tgz

`drillbox-0.0.0-40f9b05.tgz` is the npm package tarball of **Drillbox** 0.0.0, the
in-browser code workspace (editor, sandboxed run frame and exercise schema) used by the
`/drills` pages. Drillbox is not published to the npm registry, so the packed tarball is
kept in this repository and installed from here:

```json
"drillbox": "file:vendor/drillbox-0.0.0-40f9b05.tgz"
```

| Field | Value |
|-------|-------|
| Package | `drillbox` 0.0.0 |
| Source commit | `40f9b05` |
| Source branch | `workspace-ui` |
| SHA-256 (`shasum -a 256`) | `8b95a70888b5d1e8b8d08f6af65726ff575c2df1f6c367273b33b975e5b78886` |
| Licence | MIT (the `LICENSE` file inside the package) |
| Third-party notices | inside the package at `dist/frame-chunks/THIRD-PARTY-LICENSES.txt` |

Check the file against the hash above with:

```sh
shasum -a 256 vendor/drillbox-0.0.0-40f9b05.tgz
```

## Integrity

`package-lock.json` records an `integrity` hash (sha512) for `node_modules/drillbox`.
That hash pins the tarball's content: if the file in `vendor/` is changed or replaced
without updating the lockfile, `npm ci` fails with an integrity error instead of
installing different code.

## Rebuilding and replacing it

Start from a clean Drillbox checkout at the wanted commit (`git status --short` prints
nothing). `<drillbox>` below is the path to that checkout and `<sha>` its short commit
hash. Run the first four commands in the Drillbox checkout and the fifth in this
repository:

```sh
npm ci                  # 1. install Drillbox's locked dependencies
npm run build           # 2. build dist/
npm run pack:check      # 3. must print "pack-check: ok (<n> files)"
npm pack                # 4. writes drillbox-0.0.0.tgz
mv <drillbox>/drillbox-0.0.0.tgz vendor/drillbox-0.0.0-<sha>.tgz && npm install file:vendor/drillbox-0.0.0-<sha>.tgz   # 5. move it here and update package.json + package-lock.json
```

Then delete the old tarball, update the file name, commit, branch and SHA-256 in this
README, confirm that no local path leaked into the package
(`tar -xzOf vendor/drillbox-0.0.0-<sha>.tgz | grep -c "/Users/"` prints `0`), and commit
the tarball, this README, `package.json` and `package-lock.json` together.
