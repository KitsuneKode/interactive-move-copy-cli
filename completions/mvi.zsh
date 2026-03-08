# Zsh completion bootstrap for mvi and cpi.
# Source this file from .zshrc when you do not want to use fpath autoloading.

_mvi_options() {
  _values "mvi option" \
    "-h[Show help]" \
    "--help[Show help]" \
    "-v[Show version]" \
    "--version[Show version]"
}

_mvi() {
  emulate -L zsh -o extendedglob -o bareglobqual -o nullglob

  if (( CURRENT == 2 )); then
    if [[ ${words[CURRENT]} == -* ]]; then
      _mvi_options
      return
    fi

    _alternative \
      "directories:directory:_directories" \
      "options:option:_mvi_options"
    return
  fi

  _message "no more arguments"
}

_cpi() {
  _mvi "$@"
}

if ! (( $+functions[compdef] )); then
  autoload -Uz compinit
  compinit -i -d "${XDG_CACHE_HOME:-$HOME/.cache}/zsh/.zcompdump-mvi"
fi

compdef _mvi mvi
compdef _cpi cpi
