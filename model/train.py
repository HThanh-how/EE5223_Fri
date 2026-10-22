import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
torch.manual_seed(0); np.random.seed(0); torch.set_num_threads(8)
d=np.load('/root/proj/data/mnist.npz')
xtr,ytr,xte,yte=d['x_train'],d['y_train'],d['x_test'],d['y_test']
ytr_t=torch.tensor(ytr).long(); yte_t=torch.tensor(yte).long()
M='/root/proj/model/'
def batches(n,bs):
    p=torch.randperm(n)
    for i in range(0,n,bs): yield p[i:i+bs]

# ---- LeNet
class LeNet(nn.Module):
    def __init__(s):
        super().__init__()
        s.c1=nn.Conv2d(1,6,5); s.c2=nn.Conv2d(6,16,5)
        s.f1=nn.Linear(256,120); s.f2=nn.Linear(120,84); s.f3=nn.Linear(84,10)
    def forward(s,x):
        x=F.max_pool2d(F.relu(s.c1(x)),2); x=F.max_pool2d(F.relu(s.c2(x)),2)
        x=x.flatten(1); return s.f3(F.relu(s.f2(F.relu(s.f1(x)))))
Xtr=torch.tensor(xtr/255.0,dtype=torch.float32).unsqueeze(1); Xte=torch.tensor(xte/255.0,dtype=torch.float32).unsqueeze(1)
m=LeNet(); opt=torch.optim.Adam(m.parameters(),lr=1e-3)
for ep in range(10):
    m.train()
    for idx in batches(60000,128):
        opt.zero_grad(); F.cross_entropy(m(Xtr[idx]),ytr_t[idx]).backward(); opt.step()
    m.eval()
    with torch.no_grad(): acc=(m(Xte).argmax(1)==yte_t).float().mean().item()
    print('lenet ep',ep+1,acc,flush=True)
lenet_acc=acc
sd={k:v.detach().numpy().astype(np.float32) for k,v in m.state_dict().items()}
L=dict(conv1_w=sd['c1.weight'],conv1_b=sd['c1.bias'],conv2_w=sd['c2.weight'],conv2_b=sd['c2.bias'],
 fc1_w=sd['f1.weight'],fc1_b=sd['f1.bias'],fc2_w=sd['f2.weight'],fc2_b=sd['f2.bias'],fc3_w=sd['f3.weight'],fc3_b=sd['f3.bias'])
np.savez(M+'lenet_float.npz',**L)
torch.save(m.state_dict(),'/root/venv-train/lenet.pt')

# ---- LSTM
class Net(nn.Module):
    def __init__(s):
        super().__init__(); s.l=nn.LSTM(28,16,batch_first=True); s.fc=nn.Linear(16,10)
    def forward(s,x):
        o,(h,c)=s.l(x); return s.fc(h[-1])
prep=lambda x: torch.tensor(np.floor(x/2)/128.0,dtype=torch.float32)
Ltr=prep(xtr.astype(np.int64)); Lte=prep(xte.astype(np.int64))
n=Net(); EP=25
opt=torch.optim.Adam(n.parameters(),lr=3e-3)
sch=torch.optim.lr_scheduler.CosineAnnealingLR(opt,T_max=EP,eta_min=1e-4)
for ep in range(EP):
    n.train()
    for idx in batches(60000,128):
        opt.zero_grad(); F.cross_entropy(n(Ltr[idx]),ytr_t[idx]).backward()
        nn.utils.clip_grad_norm_(n.parameters(),1.0); opt.step()
        with torch.no_grad():
            for p in n.parameters(): p.clamp_(-2.0,2.0)
    sch.step(); n.eval()
    with torch.no_grad(): acc=(n(Lte).argmax(1)==yte_t).float().mean().item()
    print('lstm ep',ep+1,acc,flush=True)
lstm_acc=acc
S=dict(w_ih=n.l.weight_ih_l0,w_hh=n.l.weight_hh_l0,b=n.l.bias_ih_l0+n.l.bias_hh_l0,fc_w=n.fc.weight,fc_b=n.fc.bias)
S={k:v.detach().numpy().astype(np.float32) for k,v in S.items()}
np.savez(M+'lstm_float.npz',**S)
torch.save(n.state_dict(),'/root/venv-train/lstm.pt')

# ---- numpy verify (200 test images)
def sig(z): return 1/(1+np.exp(-z))
def np_lenet(x,W):
    def conv(x,w,b):
        N,C,H,Wd=x.shape; O,_,k,_=w.shape; oh=H-k+1
        out=np.zeros((N,O,oh,oh),np.float32)
        for i in range(k):
            for j in range(k):
                out+=np.einsum('nchw,oc->nohw',x[:,:,i:i+oh,j:j+oh],w[:,:,i,j])
        return out+b[None,:,None,None]
    def pool(x): N,C,H,W=x.shape; return x.reshape(N,C,H//2,2,W//2,2).max((3,5))
    x=pool(np.maximum(conv(x,W['conv1_w'],W['conv1_b']),0)); x=pool(np.maximum(conv(x,W['conv2_w'],W['conv2_b']),0))
    x=x.reshape(len(x),-1); x=np.maximum(x@W['fc1_w'].T+W['fc1_b'],0); x=np.maximum(x@W['fc2_w'].T+W['fc2_b'],0)
    return x@W['fc3_w'].T+W['fc3_b']
def np_lstm(x,W):
    N=len(x); h=np.zeros((N,16)); c=np.zeros((N,16))
    for t in range(28):
        z=x[:,t]@W['w_ih'].T+h@W['w_hh'].T+W['b']
        i,f,g,o=sig(z[:,:16]),sig(z[:,16:32]),np.tanh(z[:,32:48]),sig(z[:,48:])
        c=f*c+i*g; h=o*np.tanh(c)
    return h@W['fc_w'].T+W['fc_b']
Wl=dict(np.load(M+'lenet_float.npz')); Ws=dict(np.load(M+'lstm_float.npz'))
sel=slice(0,200)
with torch.no_grad():
    tl=m(Xte[sel]).numpy(); ts=n(Lte[sel]).numpy()
nl=np_lenet(Xte[sel].numpy(),Wl); ns=np_lstm(Lte[sel].numpy().astype(np.float64),{k:v.astype(np.float64) for k,v in Ws.items()})
ml=(tl.argmax(1)==nl.argmax(1)).mean(); ms=(ts.argmax(1)==ns.argmax(1)).mean()
dl=np.abs(tl-nl).max(); ds=np.abs(ts-ns).max()
print('verify lenet match',ml,'maxdiff',dl,'lstm match',ms,'maxdiff',ds)
mx=lambda D:{k:float(np.abs(v).max()) for k,v in D.items()}
print(mx(Wl)); print(mx(Ws))
with open(M+'README.txt','w') as f:
    f.write(f"""MNIST float32 models (trained with torch {torch.__version__} CPU, seed 0; data /root/proj/data/mnist.npz)

LeNet-5 (lenet_float.npz): test acc {lenet_acc*100:.2f}% (10000 test imgs)
 Preprocessing: x = pixel_uint8 / 255.0 (float32, [0,1]), shape [1,28,28], no mean/std.
 Arch: conv1 1->6 5x5 ReLU maxpool2 (6x12x12); conv2 6->16 5x5 ReLU maxpool2 (16x4x4); flatten C,H,W (256);
  fc1 256->120 ReLU; fc2 120->84 ReLU; fc3 84->10 logits. Biases everywhere, no BN/dropout, no padding.
 Training: Adam lr 1e-3, batch 128, 10 epochs, CrossEntropy, default PyTorch init, no scheduler.
 Keys (PyTorch layouts): conv1_w[6,1,5,5] conv1_b[6] conv2_w[16,6,5,5] conv2_b[16] fc1_w[120,256] fc1_b fc2_w[84,120] fc2_b fc3_w[10,84] fc3_b
 max|param|: {mx(Wl)}

LSTM (lstm_float.npz): test acc {lstm_acc*100:.2f}% (10000 test imgs)
 Preprocessing: x_t = floor(pixel_uint8/2)/128.0 (values in [0,127/128]); sequence = 28 rows, 28 features per step.
 Arch: nn.LSTM(28,16,batch_first=True), h0=c0=0, Linear(16,10) on final h_T. Gate order i,f,g,o (16 rows each).
 Training: Adam lr 3e-3, CosineAnnealing to 1e-4 over 25 epochs (stepped per epoch), batch 128, grad-clip norm 1.0,
  after every optimizer step all params clamped to [-2,2].
 Keys: w_ih[64,28] w_hh[64,16] b[64]=bias_ih+bias_hh fc_w[10,16] fc_b[10]
 max|param|: {mx(Ws)}

Numpy verification (200 test images, plain numpy reimplementation from .npz): LeNet argmax match {ml*100:.1f}% (max logit diff {dl:.2e}); LSTM match {ms*100:.1f}% (max logit diff {ds:.2e}).
""")
