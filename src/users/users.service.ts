import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { generateExpireTime, generateRandomCode } from 'src/common/utils';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dtos/create-user.dto';

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

  updateHashRefreshToken(userId: number, hashToken: string) {
    const user = this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashToken },
    });

    return user;
  }

  async activeAccount(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true, isVerifiedEmail: true },
    });
  }
}
