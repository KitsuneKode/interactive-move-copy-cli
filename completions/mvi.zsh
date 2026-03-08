#compdef mvi cpi

_mvi() {
  emulate -L zsh -o extendedglob -o bareglobqual -o nullglob

  local context curcontext="$curcontext" state line ret=1
  typeset -A opt_args
  typeset -a _arguments_options
  _arguments_options=(-s -S -C)

  _arguments "${_arguments_options[@]}" \
    "(-h --help)"{-h,--help}"[Show help]" \
    "(-v --version)"{-v,--version}"[Show version]" \
    "1:directory:_directories" \
    "*::arg:->mvi-args" && ret=0

  case "$state" in
    mvi-args)
      # `mvi` and `cpi` accept at most one positional directory.
      _message "no more arguments"
      ret=0
      ;;
  esac

  return ret
}

if [ "$funcstack[1]" = "_mvi" ]; then
  _mvi "$@"
else
  if ! (( $+functions[compdef] )); then
    autoload -Uz compinit
    compinit -i -d "${XDG_CACHE_HOME:-$HOME/.cache}/zsh/.zcompdump-mvi"
  fi

  compdef _mvi mvi
  compdef _mvi cpi
fi
