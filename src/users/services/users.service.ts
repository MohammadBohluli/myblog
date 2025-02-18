import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ResetPasswordDto } from 'src/auth/dtos/reset-password.dto';
import { generateExpireTime, generateRandomCode } from 'src/common/utils';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from '../dtos/create-user.dto';
import { UpdateUserDto } from '../dtos/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const { email, username, name, password } = createUserDto;

    const expiresAt = generateExpireTime(1);
    const verificationCode = generateRandomCode();
    const hashPassword = await argon2.hash(password);

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        password: hashPassword,
        name,
        accountVerification: { create: { verificationCode, expiresAt } },
        resetPassword: { create: { expiresAt: null, resetToken: null } },
      },
    });

    setImmediate(async () => {
      await this.mailService.sendUserConfirmation(user, verificationCode);
    });

    return user;
  }

  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(userId: number) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async updateHashRefreshToken(userId: number, hashToken: string | null) {
    const refreshToken = await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashToken },
      select: { refreshToken: true },
    });

    return refreshToken;
  }

  async activeAccount(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true, isVerifiedEmail: true },
    });
  }

  async updatePassword(userId: number, newPassword: string) {
    const hashNewPassword = await argon2.hash(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashNewPassword },
    });
  }

  async updateResetPassword(
    userId: number,
    resetPasswordDto: ResetPasswordDto,
  ) {
    const { resetToken, expiresAt } = resetPasswordDto;
    await this.prisma.resetPassword.update({
      where: { userId },
      data: { expiresAt, resetToken },
    });
  }

  async update(userId: number, updateUserDto: UpdateUserDto) {
    const { username, name } = updateUserDto;

    if ('username' in updateUserDto) {
      const user = await this.findByUsername(username);
      if (user) throw new ConflictException(`the ${username} already exists`);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name, username },
    });

    return user;
  }

  async delete(userId: number) {
    await this.prisma.user.delete({
      where: { id: userId },
      include: {
        accountVerification: true,
        resetPassword: true,
      },
    });
  }
}
