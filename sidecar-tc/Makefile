CLANG=clang
LLC=llc
CLANG_FORMAT=clang-format

CCFLAGS=-I./libbpf/src/
CCFLAGS+=-I/usr/include/x86_64-linux-gnu/

LISTEN_DEV="ens3f0"
LO_DEV="lo"

SUDO=$(shell which sudo)

.PHONY: default run clean

default: build


deps-clone:
	git clone --depth 1 https://github.com/libbpf/libbpf.git || true

deps-build: deps-clone
	cd libbpf/src && make


format:
	$(CLANG_FORMAT) -i --style=file sidecar-kern.c
	$(CLANG_FORMAT) -i --style=Google sidecar.c


build-bpf: deps-clone
	$(CLANG) $(CCFLAGS) -target bpf -O2 -emit-llvm -c sidecar-kern.c -o - | \
	$(LLC) -march=bpf -mcpu=probe -filetype=obj -o sidecar-kern.o

build-user: deps-build
	$(CLANG) $(CCFLAGS) -O2 -Wall -Wextra -Llibbpf/src -lbpf sidecar.c -o sidecar

build: build-bpf build-user


run1: build-bpf
	$(SUDO) tc qdisc add dev $(LISTEN_DEV) clsact
	$(SUDO) tc filter add dev $(LISTEN_DEV) ingress bpf direct-action object-file sidecar-kern.o section classifier

run2: build-bpf
	$(SUDO) tc qdisc add dev $(LO_DEV) clsact
	$(SUDO) tc filter add dev $(LO_DEV) ingress bpf direct-action object-file sidecar-kern.o section classifier

run: run1 run2


rerun1: build-bpf
	$(SUDO) tc filter replace dev $(LISTEN_DEV) ingress bpf direct-action object-file sidecar-kern.o section classifier

rerun2: build-bpf
	$(SUDO) tc filter replace dev $(LO_DEV) ingress bpf direct-action object-file sidecar-kern.o section classifier

rerun: rerun1 rerun2


disable:
	$(SUDO) tc filter del dev $(LISTEN_DEV) ingress || true
	$(SUDO) tc filter del dev $(LO_DEV) ingress || true
	$(SUDO) unlink /sys/fs/bpf/tc/globals/sidecar_redirects || true
	$(SUDO) unlink /sys/fs/bpf/tc/globals/sidecar_statistics || true


clean: disable
	rm -vf sidecar sidecar-kern.o

purge: clean
	rm -rf libbpf
