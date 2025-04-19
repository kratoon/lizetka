# Lizetka

## Development

- start venv: `source venv/bin/activate`
- `make build`
- `make serve`

## Deployment

- add posts to `posts/*.json` (todo how to generate posts)
- merge to main triggers GitHub action
    - json posts are converted to mkdocs posts `docs/posts/*.md`
    - mkdocs site deployed to lizetka.cz 
 