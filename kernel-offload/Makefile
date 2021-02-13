# L7mp: A programmable L7 meta-proxy
#
# Copyright 2019 by its authors.
# Some rights reserved. See AUTHORS.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the 'Software'), to
# deal in the Software without restriction, including without limitation the
# rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
# sell copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
# ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
# WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

CLANG=clang
LLC=llc
CLANG_FORMAT=clang-format

CCFLAGS=-I./libbpf/src/
CCFLAGS+=-I/usr/include/x86_64-linux-gnu/

.PHONY: default clean purge clone_deps

default: build


clone_deps:
	git clone --depth 1 https://github.com/libbpf/libbpf.git || true

format:
	$(CLANG_FORMAT) -i --style=file udp_kernel_offload.c

build: clone_deps
	$(CLANG) $(CCFLAGS) -target bpf -O2 -emit-llvm -c udp_kernel_offload.c -o - | \
	$(LLC) -march=bpf -mcpu=probe -filetype=obj -o udp_kernel_offload.o

clean:
	rm -vf udp_kernel_offload.o

purge: clean
	rm -rf libbpf
