# Lizetka

## Blog Post Editor

Create blog posts at [https://editor.lizetka.cz/](https://editor.lizetka.cz/).
Upload blog posts (files with .json) to [https://github.com/kratoon/lizetka/tree/main/posts](https://github.com/kratoon/lizetka/tree/main/posts)

## Development

- prepare venv (just once): `prepare-env`
- start venv: `source venv/bin/activate`
- `make build`
- `make serve`

## Deployment

- add posts to `posts/*.json` (todo how to generate posts)
- merge to main triggers GitHub action
    - json posts are converted to mkdocs posts `docs/posts/*.md`
    - mkdocs site deployed to lizetka.cz 
 