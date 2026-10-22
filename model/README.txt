MNIST float32 models (trained with torch 2.14.1+cpu CPU, seed 0; data /root/proj/data/mnist.npz)

LeNet-5 (lenet_float.npz): test acc 98.83% (10000 test imgs)
 Preprocessing: x = pixel_uint8 / 255.0 (float32, [0,1]), shape [1,28,28], no mean/std.
 Arch: conv1 1->6 5x5 ReLU maxpool2 (6x12x12); conv2 6->16 5x5 ReLU maxpool2 (16x4x4); flatten C,H,W (256);
  fc1 256->120 ReLU; fc2 120->84 ReLU; fc3 84->10 logits. Biases everywhere, no BN/dropout, no padding.
 Training: Adam lr 1e-3, batch 128, 10 epochs, CrossEntropy, default PyTorch init, no scheduler.
 Keys (PyTorch layouts): conv1_w[6,1,5,5] conv1_b[6] conv2_w[16,6,5,5] conv2_b[16] fc1_w[120,256] fc1_b fc2_w[84,120] fc2_b fc3_w[10,84] fc3_b
 max|param|: {'conv1_w': 0.5196609497070312, 'conv1_b': 0.21386197209358215, 'conv2_w': 0.600156843662262, 'conv2_b': 0.23335294425487518, 'fc1_w': 0.5415789484977722, 'fc1_b': 0.1138765960931778, 'fc2_w': 0.6064826846122742, 'fc2_b': 0.15074028074741364, 'fc3_w': 0.39323338866233826, 'fc3_b': 0.11366213858127594}

LSTM (lstm_float.npz): test acc 97.58% (10000 test imgs)
 Preprocessing: x_t = floor(pixel_uint8/2)/128.0 (values in [0,127/128]); sequence = 28 rows, 28 features per step.
 Arch: nn.LSTM(28,16,batch_first=True), h0=c0=0, Linear(16,10) on final h_T. Gate order i,f,g,o (16 rows each).
 Training: Adam lr 3e-3, CosineAnnealing to 1e-4 over 25 epochs (stepped per epoch), batch 128, grad-clip norm 1.0,
  after every optimizer step all params clamped to [-2,2].
 Keys: w_ih[64,28] w_hh[64,16] b[64]=bias_ih+bias_hh fc_w[10,16] fc_b[10]
 max|param|: {'w_ih': 2.0, 'w_hh': 2.0, 'b': 1.936545729637146, 'fc_w': 2.0, 'fc_b': 1.269801139831543}

Numpy verification (200 test images, plain numpy reimplementation from .npz): LeNet argmax match 100.0% (max logit diff 6.91e-06); LSTM match 100.0% (max logit diff 3.35e-06).
