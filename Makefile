mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
project_dir := $(dir $(mkfile_path))

install-mkdocs:
	python3 -m pip install mkdocs
	python3 -m pip install mkdocs-material
	python3 -m pip install mkdocs-minify-plugin
	python3 -m pip install mkdocs-blog-plugin
	python3 -m pip install mkdocs-git-revision-date-localized-plugin
	python3 -m pip install mkdocs-git-committers-plugin
	python3 -m pip install 'mkdocs[i18n]'

serve:
	python3 -m http.server --directory site

write-posts:
	bash ./scripts/bin/write-posts.sh
	
build:
	make write-posts
	python3 -m mkdocs build --site-dir site --config-file mkdocs.yml
