#compdef mvi cpi

# Zsh completion for mvi and cpi

_mvi() {
    local -a opts
    opts=(
        '(-h --help)'{-h,--help}'[Show help message]'
        '(-v --version)'{-v,--version}'[Show version]'
    )

    _arguments -s $opts \
        '1:directory:_directories'
}

_mvi "$@"
