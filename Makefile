mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
project_dir := $(dir $(mkfile_path))

serve:
	python3 -m http.server --directory site
	
build:
	python3 -m mkdocs build --site-dir site --config-file mkdocs.yml
