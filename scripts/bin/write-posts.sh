#!/usr/bin/env bash

IMAGE_DIR="./docs/public/build/images"

# Clean public images
rm -rf "${IMAGE_DIR}"

node ./scripts/bin/write-posts.js

# Loop through each .b64 file
for b64_file in "$IMAGE_DIR"/*.b64; do
  [ -e "$b64_file" ] || continue  # skip if no matching files
  # Read the first line to detect the image type
  header=$(head -n 1 "$b64_file")
  # Determine the image extension
  if [[ "$header" == data:image/jpeg* ]]; then
    ext="jpg"
  elif [[ "$header" == data:image/png* ]]; then
    ext="png"
  elif [[ "$header" == data:image/gif* ]]; then
    ext="gif"
  else
    echo "Unknown image type in $b64_file"
    continue
  fi
  # Strip the data URI prefix if present
  base64_data=$(sed 's/^data:image\/[a-zA-Z0-9+]*;base64,//' "$b64_file")
  # Output file name (same as input, but with correct extension)
  output_file="${b64_file%.b64}.$ext"
  # Decode base64 to image file
  echo "$base64_data" | base64 --decode > "$output_file"
  echo "Converted $b64_file -> $output_file"
  rm "$b64_file"
done
