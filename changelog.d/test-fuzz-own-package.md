### Fixed

- Run `go tool nsgo test -fuzz` against the directory's own package, so a directory with subpackages can be fuzzed instead of failing with "cannot use -fuzz flag with multiple packages" (#2268 by @Laotree).
