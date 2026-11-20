from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.oxml.xmlchemy import OxmlElement

OUT = Path(__file__).with_name('EE5223_block_diagrams.pptx')
prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
prs.core_properties.author = 'Nhom 5 - EE5223'
prs.core_properties.title = 'EE5223 - Sơ đồ khối NPU INT8'
prs.core_properties.subject = 'Sơ đồ khối có thể chỉnh sửa'
prs.core_properties.last_modified_by = 'Nhom 5 - EE5223'
C = {'data':'D9EAF7','control':'FCEBC7','memory':'DDF0DE','external':'E8E8E8','ink':'172B3A','line':'34495E','white':'FFFFFF'}
def color(k): return RGBColor.from_string(C.get(k,k))
def inch(n): return Inches(n)
def box(s, name, x,y,w,h, text, kind='data', size=17, bold=False, rounded=False):
    sh=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE, inch(x),inch(y),inch(w),inch(h))
    sh.name=name; sh.fill.solid(); sh.fill.fore_color.rgb=color(kind); sh.line.color.rgb=color('line'); sh.line.width=Pt(1.25)
    tf=sh.text_frame; tf.clear(); tf.word_wrap=True
    tf.margin_left=tf.margin_right=inch(.07); tf.margin_top=tf.margin_bottom=inch(.035); tf.vertical_anchor=MSO_ANCHOR.MIDDLE
    for i, line in enumerate(text.split('\n')):
        p=tf.paragraphs[0] if i==0 else tf.add_paragraph(); p.text=line; p.alignment=PP_ALIGN.CENTER
        p.font.name='Calibri'; p.font.size=Pt(size); p.font.bold=bold if i==0 else False; p.font.color.rgb=color('ink')
    return sh
def label(s,name,x,y,w,h,text,size=16,bold=False,align=PP_ALIGN.CENTER):
    sh=s.shapes.add_textbox(inch(x),inch(y),inch(w),inch(h)); sh.name=name
    tf=sh.text_frame; tf.clear(); tf.word_wrap=True; tf.margin_left=tf.margin_right=inch(.025); tf.margin_top=tf.margin_bottom=inch(.015); tf.vertical_anchor=MSO_ANCHOR.MIDDLE
    p=tf.paragraphs[0]; p.text=text; p.alignment=align; p.font.name='Calibri'; p.font.size=Pt(size); p.font.bold=bold; p.font.color.rgb=color('ink')
    return sh
def arrow(s,name,a,b,ai=3,bi=1):
    c=s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,0,0,inch(.1),inch(.1)); c.name=name
    c.begin_connect(a,ai); c.end_connect(b,bi); c.line.color.rgb=color('line'); c.line.width=Pt(1.5)
    ln=c._element.spPr.ln; end=OxmlElement('a:tailEnd'); end.set('type','triangle'); ln.append(end)
    return c
def slide(title, source):
    s=prs.slides.add_slide(prs.slide_layouts[6]); s.background.fill.solid(); s.background.fill.fore_color.rgb=color('white')
    label(s,'Tiêu đề',.45,.18,12.4,.48,title,27,True,PP_ALIGN.LEFT)
    label(s,'Nguồn RTL',.48,6.98,12.3,.38,'Nguồn: '+source,14,False,PP_ALIGN.LEFT)
    return s

s=slide('EE5223  |  NHÓM 5','README.md; rtl/sa_top.sv; rtl/npu_avmm.sv')
label(s,'Tên đề tài',.8,1.35,11.7,1.25,'Thiết kế và tích hợp bộ tăng tốc nhân ma trận INT8 theo kiến trúc Systolic Array cho mạng CNN',29,True)
label(s,'Thành viên',2.15,3.25,9,1.65,'Phạm Tuấn An      MSSV: 2470215\nPhạm Huy Thanh  MSSV: 2570317\nVũ Tiến Giang       MSSV 2570188',20)
label(s,'Bối cảnh',2.1,5.45,9,.5,'INT8 NPU trong hệ thống RISC-V SoC',19)

s=slide('01  Sơ đồ khối tổng thể','soc/soc_top.sv; rtl/npu_avmm.sv; rtl/sa_top.sv; README.md')
cpu=box(s,'CPU',.6,1.35,2.5,1.05,'CPU RISC-V\nPicoRV32 / Nios V','external',18,True)
ram=box(s,'RAM',.6,3.15,2.5,.9,'RAM chương trình / dữ liệu','memory',17)
bridge=box(s,'Cầu bus',3.75,1.35,2.0,1.05,'Giao tiếp bus\nAvalon-MM','external',17)
wrap=box(s,'NPU wrapper',6.4,1.18,2.35,1.38,'npu_avmm\nThanh ghi + bộ đệm\nSequencer','control',16,True)
arr=box(s,'Systolic array',9.5,1.05,2.75,1.0,'sa_top\nSystolic Array NxN','data',17,True)
post=box(s,'Hậu xử lý',9.5,3.08,2.75,1.05,'Hậu xử lý\nTích lũy / lượng tử hóa','data',16)
arrow(s,'CPU đến bus',cpu,bridge); arrow(s,'Bus đến wrapper',bridge,wrap); arrow(s,'Wrapper đến array',wrap,arr); arrow(s,'Array đến hậu xử lý',arr,post,2,0); arrow(s,'CPU đến RAM',cpu,ram,2,0)
label(s,'Đọc kết quả',4.2,4.85,5.7,.65,'CPU ghi cấu hình, trọng số, activation; đọc CBUF / QBUF',17)
label(s,'Phạm vi',1,6.0,11.4,.55,'Mô phỏng: PicoRV32 + bridge  |  DE10-Nano: Nios V + Avalon-MM',16)

s=slide('02  Systolic Array: weight-stationary','rtl/sa_top.sv; rtl/pe.sv')
label(s,'Đầu vào activation',.55,1.15,3.0,.4,'Activation a_in (INT8)',17,True)
label(s,'Tổng riêng',5.65,.9,2.5,.4,'psum_in = 0',17,True)
g=s.shapes.add_group_shape(); g.name='Lưới PE 4x4 (ví dụ NxN)'
# Build a true PowerPoint group with PE shapes and local connectors.
pes=[]
for i in range(4):
    row=[]
    for j in range(4):
        p=box(g,f'PE hàng {i} cột {j}',3.65+j*1.15,1.55+i*1.03,.75,.6,f'PE {i},{j}','data',14,True); row.append(p)
    pes.append(row)
for i in range(4):
    for j in range(3): arrow(g,f'Activation {i},{j}',pes[i][j],pes[i][j+1])
for i in range(3):
    for j in range(4): arrow(g,f'Psum {i},{j}',pes[i][j],pes[i+1][j],2,0)
label(s,'Luồng activation',.55,2.15,2.65,.9,'Activation truyền\nsang phải',17)
label(s,'Luồng psum',9.1,2.15,3.2,.9,'Partial sum INT32\ntruyền xuống',17)
label(s,'Trọng số',8.85,4.05,3.6,1.1,'w[i][j] cố định trong sa_top\nCấp cho từng PE',17)
label(s,'Kích thước',3.1,6.1,7.1,.45,'Ví dụ 4×4; thiết kế tham số hóa NxN',17,True)

s=slide('03  Datapath bên trong PE','rtl/pe.sv; rtl/sa_top.sv')
a=box(s,'a_in',.5,1.65,1.35,.65,'a_in\nINT8','external',15)
w=box(s,'w',.5,3.95,1.35,.65,'w\nINT8','external',15)
mul=box(s,'Nhân',2.45,2.3,1.65,.9,'Nhân có dấu','data',17,True)
psum=box(s,'psum_in',4.45,1.25,1.5,.65,'psum_in\nINT32','external',15)
add=box(s,'Cộng',5.0,2.3,1.65,.9,'Cộng','data',17,True)
reg=box(s,'Thanh ghi psum',7.35,2.3,1.75,.9,'Thanh ghi\npsum_out','data',16,True)
out=box(s,'psum_out',10.05,2.3,1.75,.9,'psum_out\nINT32','external',16)
arrow(s,'a đến nhân',a,mul); arrow(s,'w đến nhân',w,mul); arrow(s,'Tích đến cộng',mul,add); arrow(s,'psum đến cộng',psum,add,2,0); arrow(s,'Cộng đến thanh ghi',add,reg); arrow(s,'Xuất psum',reg,out)
areg=box(s,'Thanh ghi activation',3.1,4.6,2.1,.85,'Thanh ghi\na_out','data',16,True)
aout=box(s,'a_out',6.0,4.6,1.65,.85,'a_out\nINT8','external',16)
arrow(s,'a vào thanh ghi',a,areg,2,1); arrow(s,'Xuất activation',areg,aout)
label(s,'Đồng bộ',7.9,5.25,4.2,.8,'Hai đầu ra cập nhật theo clk;\nrst_n xóa bất đồng bộ',16)

s=slide('04  Skew / De-skew','rtl/sa_top.sv; rtl/delay.sv')
label(s,'Tiêu đề skew',.5,1.05,3.4,.45,'Skew đầu vào: hàng i',18,True)
label(s,'Tiêu đề deskew',8.85,1.05,3.9,.45,'De-skew đầu ra: cột j',18,True)
core=box(s,'Lõi PE',5.15,2.05,2.55,2.85,'Lưới PE\nNxN','data',21,True)
for k in range(3):
    left=box(s,f'Delay hàng {k}',.65,1.7+k*1.03,2.65,.65,['D = 0  (nối thẳng)','D = 1 chu kỳ','D = i chu kỳ'][k],'control',16)
    right=box(s,f'Delay cột {k}',9.15,1.7+k*1.03,3.05,.65,['D = N−1 chu kỳ','D = N−2 chu kỳ','D = N−1−j chu kỳ'][k],'control',16)
    arrow(s,f'Skew {k}',left,core); arrow(s,f'De-skew {k}',core,right)
label(s,'Valid',1.0,5.6,11.3,.8,'in_valid qua delay 2N−1 chu kỳ tạo out_valid; c_out đồng bộ theo hàng',17)

s=slide('05  Wrapper Avalon-MM','rtl/npu_avmm.sv')
bus=box(s,'Avalon-MM',.4,2.3,1.9,1.05,'Avalon-MM\n32-bit','external',17,True)
regs=box(s,'Thanh ghi',3.0,1.05,3.0,.85,'CTRL, STATUS, M, CYCLES, INFO','control',15,True)
config=box(s,'Cấu hình lượng tử',3.0,2.25,3.0,.85,'QMULT, QSHIFT, ACT, BIAS','control',15)
abuf=box(s,'ABUF',3.0,3.45,3.0,.85,'ABUF / amem\nActivation INT8','memory',16,True)
weights=box(s,'Ghi trọng số',3.0,4.65,3.0,.85,'WEIGHT: ghi trực tiếp','memory',16)
seq=box(s,'Sequencer',6.8,1.05,2.25,.85,'Sequencer\nsent / recv / va','control',16,True)
sa=box(s,'sa_top',6.8,3.45,2.25,.85,'sa_top\nSystolic Array','data',16,True)
cb=box(s,'CBUF',10.0,2.3,2.55,.85,'CBUF / cmem\nINT32','memory',16,True)
pp=box(s,'Post-processing',10.0,3.75,2.55,.85,'Post-processing','data',16,True)
qb=box(s,'QBUF',10.0,5.15,2.55,.85,'QBUF / qmem\nINT8','memory',16,True)
arrow(s,'Bus thanh ghi',bus,regs); arrow(s,'Bus ABUF',bus,abuf); arrow(s,'Ghi weight',weights,sa); arrow(s,'Đọc ABUF',abuf,sa); arrow(s,'Điều khiển',regs,seq); arrow(s,'Array đến CBUF',sa,cb); arrow(s,'Array đến post',sa,pp); arrow(s,'Post đến QBUF',pp,qb,2,0)
label(s,'Giao diện',.75,6.28,11.8,.5,'Cửa sổ 64 KiB; địa chỉ word 14 bit; readLatency = 1; waitrequest = 0',16)

s=slide('06  Datapath hậu xử lý phần cứng','rtl/npu_avmm.sv')
cs=box(s,'c_out',.25,2.1,1.45,.8,'c_out\nINT32','external',15)
acc=box(s,'Tích lũy',2.05,2.1,1.75,.8,'Cộng dồn\nACCUM','data',16,True)
bias=box(s,'Cộng bias',4.15,2.1,1.55,.8,'Cộng\nBIAS[j]','data',16,True)
mult=box(s,'Nhân QMULT',6.05,2.1,1.55,.8,'Nhân\nQMULT','data',16,True)
shift=box(s,'Dịch và bão hòa',7.95,2.1,1.7,.8,'Làm tròn\nDịch / clamp8','data',15,True)
act=box(s,'Activation',10.05,2.1,1.55,.8,'ACT\n/ LUT','data',16,True)
q=box(s,'Kết quả INT8',11.9,2.1,1.1,.8,'QBUF\nINT8','memory',15,True)
for n,a,b in [('c_acc',cs,acc),('acc_bias',acc,bias),('bias_mult',bias,mult),('mult_shift',mult,shift),('shift_act',shift,act),('act_q',act,q)]: arrow(s,n,a,b)
cb=box(s,'CBUF trước',2.05,4.0,1.75,.85,'CBUF cũ\nhoặc 0','memory',15)
arrow(s,'CBUF đến tích lũy',cb,acc,0,2)
label(s,'Lưu sum',.5,5.3,4.4,.85,'sum_row được ghi vào CBUF; ACCUM chọn cộng CBUF cũ.',16)
label(s,'Requant',5.05,4.1,4.65,1.2,'QMULT có dấu 16-bit\nQSHIFT: 0–31; làm tròn trước dịch số học',16)
label(s,'Lựa chọn ACT',9.85,4.1,3.1,1.2,'None / ReLU\nSigmoid LUT / Tanh LUT',16)
label(s,'QUANT',4.6,6.3,5,.4,'Nhánh QBUF chạy khi QUANT = 1',16,True)

s=slide('07  Chú giải và chỉnh sửa','rtl/pe.sv; rtl/delay.sv; rtl/sa_top.sv; rtl/npu_avmm.sv; soc/soc_top.sv')
for i,(kind,title,desc) in enumerate([('data','Datapath','Phép toán và đường dữ liệu'),('control','Control','Điều khiển, cấu hình và độ trễ'),('memory','Memory','Thanh ghi trọng số và bộ đệm'),('external','External','CPU, bus và các cổng tín hiệu')]):
    box(s,'Chú giải '+title,.8,1.15+i*.8,2.1,.6,title,kind,17,True)
    label(s,'Mô tả '+title,3.2,1.15+i*.8,5.7,.6,desc,17,False,PP_ALIGN.LEFT)
label(s,'Hướng dẫn',.8,5.05,11.8,1.2,'Chọn khối để sửa văn bản hoặc màu. Dùng Selection Pane để chọn theo tên.\nLưới PE là một nhóm: chọn nhóm rồi Ungroup để sửa từng PE.\nCác connector gắn vào khối; di chuyển khối để giữ kết nối.',17,False,PP_ALIGN.LEFT)

prs.save(OUT)
# Reopen and check editable shapes and geometry. Groups are checked recursively.
check=Presentation(OUT)
def walk(shapes, slide_no):
    rects=[]
    for sh in shapes:
        if sh.shape_type == 6:
            yield from walk(sh.shapes, slide_no)
        elif sh.shape_type != 9:
            assert sh.left >= -100 and sh.top >= -100 and sh.left+sh.width <= check.slide_width+100 and sh.top+sh.height <= check.slide_height+100, (slide_no,sh.name)
            if sh.has_text_frame and sh.text.strip(): rects.append(sh)
    for i,a in enumerate(rects):
        for b in rects[i+1:]:
            overlap_x=min(a.left+a.width,b.left+b.width)-max(a.left,b.left)
            overlap_y=min(a.top+a.height,b.top+b.height)-max(a.top,b.top)
            assert overlap_x <= 0 or overlap_y <= 0, (slide_no,a.name,b.name)
    yield len(shapes)
for i,sl in enumerate(check.slides,1):
    list(walk(sl.shapes,i)); print(f'Slide {i}: {len(sl.shapes)} shapes')
print('Saved:',OUT,OUT.stat().st_size,'bytes')

