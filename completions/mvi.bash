#!/usr/bin/env bash
# Bash completion for mvi and cpi

_mvi_completion() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    local prev="${COMP_WORDS[COMP_CWORD-1]}"

    case "$cur" in
        -*)
            COMPREPLY=($(compgen -W "--help --version -h -v" -- "$cur"))
            return
            ;;
    esac

    # Default to directory completion
    COMPREPLY=($(compgen -d -- "$cur"))
}

complete -o dirnames -F _mvi_completion mvi
complete -o dirnames -F _mvi_completion cpi
