#!/bin/zsh
set -e
cd "${0:A:h:h}"
python3 scripts/models.py install translation
