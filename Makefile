mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
project_dir := $(dir $(mkfile_path))

prepare:
	python3 -m venv venv
	source venv/bin/activate
	python3 -m pip install mkdocs
	python3 -m pip install mkdocs-material
	python3 -m pip install mkdocs-minify-plugin
	python3 -m pip install mkdocs-blog-plugin
	python3 -m pip install mkdocs-git-revision-date-localized-plugin
	python3 -m pip install mkdocs-git-committers-plugin
	python3 -m pip install 'mkdocs[i18n]'

serve:
	python3 -m http.server --directory site
	
build:
	node ./scripts/bin/write-posts.js
	python3 -m mkdocs build --site-dir site --config-file mkdocs.yml
