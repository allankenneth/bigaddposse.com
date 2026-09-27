#!/usr/bin/env python3
"""Replace or revoke the community codes without storing them in source files."""
import getpass
import hashlib
import json
import pathlib
import subprocess
import sys

if len(sys.argv) != 2 or sys.argv[1] not in ('set', 'revoke-all'):
    sys.exit('Usage: python3 worker/codes.py set | revoke-all')

hashes = []
if sys.argv[1] == 'set':
    print('Enter the complete set of codes to keep active. Omitted codes are revoked.')
    while True:
        code = getpass.getpass('Submitter code (empty to finish): ')
        if not code:
            break
        if len(code) > 256:
            sys.exit('Codes must be 256 characters or fewer.')
        hashes.append(hashlib.sha256(code.encode('utf-8')).hexdigest())
    if not hashes:
        sys.exit('No codes supplied; unchanged. Use revoke-all to disable submissions.')

# Only SHA-256 hashes are sent to Cloudflare; no codes are printed or saved.
result = subprocess.run(
    ['npx', '--yes', 'wrangler@4', 'secret', 'put', 'MEMBER_SUBMITTER_CODE_HASHES'],
    cwd=pathlib.Path(__file__).resolve().parent,
    input=json.dumps(sorted(set(hashes))), text=True,
)
sys.exit(result.returncode)
