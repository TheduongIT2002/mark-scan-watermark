#!/usr/bin/env bash
set -euo pipefail

service_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
virtual_environment="${service_root}/.venv"
python_executable="${virtual_environment}/bin/python"
bootstrap_python="${MARKSCAN_PYTHON:-python3}"
torch_index_url="${MARKSCAN_TORCH_INDEX_URL:-https://download.pytorch.org/whl/cpu}"

if [[ ! -x "${python_executable}" ]]; then
  if ! command -v "${bootstrap_python}" >/dev/null 2>&1; then
    echo "Python 3.10+ was not found. Install python3-venv or set MARKSCAN_PYTHON." >&2
    exit 1
  fi
  "${bootstrap_python}" -m venv "${virtual_environment}"
fi

"${python_executable}" -m pip install --no-cache-dir --upgrade pip
"${python_executable}" -m pip install --no-cache-dir "torch>=2.6,<3" --index-url "${torch_index_url}"
"${python_executable}" -m pip install --no-cache-dir -r "${service_root}/requirements.txt"

cd "${service_root}"
exec "${python_executable}" -m uvicorn server:app --host 127.0.0.1 --port 8384
