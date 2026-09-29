#define _GNU_SOURCE
#include <fcntl.h>
#include <linux/fs.h>
#include <stdio.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef RENAME_EXCHANGE
#define RENAME_EXCHANGE (1U << 1)
#endif

int main(int argc, char **argv) {
    if (argc != 3) {
        fprintf(stderr, "usage: install-swap STAGED_DIR LIVE_DIR\n");
        return 2;
    }
    if (syscall(SYS_renameat2, AT_FDCWD, argv[1], AT_FDCWD, argv[2], RENAME_EXCHANGE) != 0) {
        perror("renameat2 exchange");
        return 1;
    }
    return 0;
}
