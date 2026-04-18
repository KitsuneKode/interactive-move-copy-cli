#compdef mvi cpi rmi

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

_rmi_options() {
  _values "rmi option" \
    "-h[Show help]" \
    "--help[Show help]" \
    "-v[Show version]" \
    "--version[Show version]" \
    "--trash[Move items to trash]" \
    "--hard-delete[Permanently delete items]"
}

_rmi() {
  emulate -L zsh -o extendedglob -o bareglobqual -o nullglob

  if (( CURRENT == 2 )); then
    if [[ ${words[CURRENT]} == -* ]]; then
      _rmi_options
      return
    fi

    _alternative \
      "directories:directory:_directories" \
      "options:option:_rmi_options"
    return
  fi

  if (( CURRENT == 3 )) && [[ ${words[2]} == --trash || ${words[2]} == --hard-delete ]]; then
    _directories
    return
  fi

  _message "no more arguments"
}

(( $+functions[compdef] )) && {
  compdef _mvi mvi
  compdef _cpi cpi
  compdef _rmi rmi
}
