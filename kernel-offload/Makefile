CLANG=clang
LLC=llc
CLANG_FORMAT=clang-format

CCFLAGS=-I./libbpf/src/
CCFLAGS+=-I/usr/include/x86_64-linux-gnu/

.PHONY: default clean

default: build


deps-clone:
	git clone --depth 1 https://github.com/libbpf/libbpf.git || true

format:
	$(CLANG_FORMAT) -i --style=file udp_kernel_offload.c

build: deps-clone
	$(CLANG) $(CCFLAGS) -target bpf -O2 -emit-llvm -c udp_kernel_offload.c -o - | \
	$(LLC) -march=bpf -mcpu=probe -filetype=obj -o udp_kernel_offload.o

clean:
	rm -vf udp_kernel_offload.o

purge: clean
	rm -rf libbpf
