#!/usr/bin/env bash
# Bash completion for mvi, cpi, and rmi

_mvi_completion() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    local cmd="${COMP_WORDS[0]}"

    case "$cur" in
        -*)
            if [[ "$cmd" == "rmi" ]]; then
                COMPREPLY=($(compgen -W "--help --version --trash --hard-delete -h -v" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--help --version -h -v" -- "$cur"))
            fi
            return
            ;;
    esac

    # Default to directory completion
    COMPREPLY=($(compgen -d -- "$cur"))
}

complete -o dirnames -F _mvi_completion mvi
complete -o dirnames -F _mvi_completion cpi
complete -o dirnames -F _mvi_completion rmi
