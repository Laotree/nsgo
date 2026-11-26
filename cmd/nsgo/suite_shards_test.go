package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"
)

// test.yml runs the suite as two jobs of test-name patterns, as `go tool nsgo
// test` takes one directory. A test that matches neither pattern never runs,
// and one that matches both runs twice, so this walks every test in the module
// and checks that exactly one pattern takes each.
func TestSuiteShardPatternsCoverEveryTest(t *testing.T) {
	data, err := os.ReadFile("../../.github/workflows/test.yml")
	if err != nil {
		t.Fatal(err)
	}
	var workflow struct {
		Jobs map[string]struct {
			Strategy struct {
				Matrix struct {
					Tests []string
				}
			}
		}
	}
	if err := yaml.Unmarshal(data, &workflow); err != nil {
		t.Fatal(err)
	}
	shards := workflow.Jobs["test-suite"].Strategy.Matrix.Tests
	if len(shards) < 2 {
		t.Fatalf("test-suite has %d test patterns, want two or more", len(shards))
	}
	patterns := make([]*regexp.Regexp, len(shards))
	for i, shard := range shards {
		patterns[i] = regexp.MustCompile(shard)
	}

	used := make([]int, len(shards))
	names := testFunctions(t)
	if len(names) == 0 {
		t.Fatal("found no tests to check")
	}
	for _, name := range names {
		matched := -1
		for i, re := range patterns {
			if re.MatchString(name) {
				if matched >= 0 {
					t.Errorf("%s matches %q and %q; it would run twice", name, shards[matched], shards[i])
				}
				matched = i
			}
		}
		if matched < 0 {
			t.Errorf("%s matches no pattern and would never run", name)
			continue
		}
		used[matched]++
	}
	for i, n := range used {
		if n == 0 {
			t.Errorf("pattern %q takes no test", shards[i])
		}
	}
}

// testFunctions lists the names of the module's top-level tests, TestMain aside:
// it starts a package's tests rather than being one.
func testFunctions(t *testing.T) []string {
	t.Helper()
	var names []string
	decl := regexp.MustCompile(`(?m)^func (Test[A-Za-z0-9_]*)\(`)
	err := filepath.WalkDir("../..", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", "node_modules", "target":
				return fs.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, "_test.go") {
			return nil
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, m := range decl.FindAllStringSubmatch(string(src), -1) {
			if m[1] != "TestMain" {
				names = append(names, m[1])
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return names
}
