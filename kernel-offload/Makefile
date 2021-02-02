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
	$(CLANG_FORMAT) -i --style=file l7mp-uko.c

build: deps-clone
	$(CLANG) $(CCFLAGS) -target bpf -O2 -emit-llvm -c l7mp-uko.c -o - | \
	$(LLC) -march=bpf -mcpu=probe -filetype=obj -o l7mp-uko.o

clean:
	rm -vf l7mp-uko.o

purge: clean
	rm -rf libbpf
