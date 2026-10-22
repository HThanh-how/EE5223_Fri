import sys
data = open(sys.argv[1], "rb").read()
data += b"\0" * (-len(data) % 4)
for i in range(0, len(data), 4):
    print("%08x" % int.from_bytes(data[i:i + 4], "little"))
